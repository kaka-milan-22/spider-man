import { displayTime, escapeHtml } from './display';

export const MONITORS = {
  crypto: 'Crypto / Coinbase',
  stocks: 'Stocks / Yahoo',
  market: 'Market / Yahoo',
  oil: 'Oil / Yahoo + GasWatch',
  exrate: '汇率 / Currency API 或缓存',
  hn: 'Hacker News API 或缓存',
  ars: 'Ars RSS 或缓存',
  eth: 'ETH brief / 数据源或缓存',
  calendar: 'Calendar / Fed + BLS + EIA',
  telegram: 'Telegram 发送',
} as const;
export type MonitorKey = keyof typeof MONITORS;
export const STATUS_PREFIX = 'status:v1:';

interface Observation {
  checkedAt: number;
  lastSuccessAt: number | null;
  durationMs: number;
  ok: boolean;
  detail: string;
}

export interface HealthResult { ok: boolean; detail: string }

function observation(value: unknown): value is Observation {
  if (!value || typeof value !== 'object') return false;
  const o = value as Observation;
  return typeof o.ok === 'boolean' && Number.isFinite(o.checkedAt) && o.checkedAt > 0
    && Number.isFinite(o.durationMs) && o.durationMs >= 0 && typeof o.detail === 'string'
    && (o.lastSuccessAt === null || (Number.isFinite(o.lastSuccessAt) && o.lastSuccessAt > 0));
}

function safeFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  const code = message.match(/(?:HTTP|error:)\s*(\d{3})\b/i)?.[1];
  if (code) return `请求失败（HTTP ${code}）`;
  if (error instanceof Error && /timeout|abort/i.test(error.name)) return '请求超时';
  // Never persist exception messages, URLs, credentials, or Telegram message text.
  return '请求失败，详情请检查 Worker 日志';
}

async function writeObservation(kv: KVNamespace, key: MonitorKey, startedAt: number, result: HealthResult): Promise<void> {
  const checkedAt = Date.now();
  const durationMs = Math.max(0, checkedAt - startedAt);
  try {
    const previous = await kv.get(`${STATUS_PREFIX}${key}`, 'json');
    // Avoid overwriting a newer result when overlapping requests finish out of order.
    if (observation(previous) && previous.checkedAt > checkedAt) return;
    await kv.put(`${STATUS_PREFIX}${key}`, JSON.stringify({
      checkedAt, durationMs, ok: result.ok, detail: result.detail.slice(0, 160),
      lastSuccessAt: result.ok ? checkedAt : observation(previous) ? previous.lastSuccessAt : null,
    } satisfies Observation), { expirationTtl: 30 * 86400 });
  } catch {
    console.warn(`Unable to persist ${key} status`);
  }
}

export async function observe<T>(
  kv: KVNamespace, key: MonitorKey, action: () => Promise<T>,
  assess: (value: T) => HealthResult = () => ({ ok: true, detail: '成功' }),
): Promise<T> {
  const startedAt = Date.now();
  let value: T;
  try { value = await action(); } catch (error) {
    await writeObservation(kv, key, startedAt, { ok: false, detail: safeFailure(error) });
    throw error;
  }
  await writeObservation(kv, key, startedAt, assess(value));
  return value;
}

export function availability(available: number, total: number): HealthResult {
  return { ok: available === total && available > 0, detail: `${available}/${total} 项可用` };
}

export function quoteAvailability(quotes: Array<{ price: number | null; error?: string }>): HealthResult {
  const result = availability(quotes.filter(quote => quote.price !== null).length, quotes.length);
  const errors = [...new Set(quotes.flatMap(quote => quote.error ? [quote.error] : []))];
  return { ...result, detail: result.detail + (errors.length ? `；${errors.join(' / ')}` : '') };
}

export interface WebhookStatus {
  pendingUpdates: number;
  lastErrorAt?: number;
  lastError?: string;
  configured: boolean;
}

export async function formatStatus(kv: KVNamespace, webhook: WebhookStatus | null): Promise<string> {
  const lines = ['<b>🛠 Bot 运行状态</b>', '', `检查时间：${displayTime(Date.now())} UTC+8`];
  if (webhook) {
    lines.push(`Webhook：${webhook.configured ? '已配置' : '未配置'} · 待投递 ${webhook.pendingUpdates} 条`);
    if (webhook.lastErrorAt) lines.push(`上次投递错误：${displayTime(webhook.lastErrorAt * 1000)} UTC+8 · ${escapeHtml(webhook.lastError || '未知')}`);
  } else lines.push('Webhook：Telegram 状态查询失败');
  const statuses = await Promise.all(Object.entries(MONITORS).map(async ([key, label]) => {
    try {
      const data = await kv.get(`${STATUS_PREFIX}${key}`, 'json');
      if (!observation(data)) return `⚪ ${label}：暂无调用记录`;
      return `${data.ok ? '✅' : '⚠️'} ${label} · ${data.durationMs} ms\n`
        + `最近：${displayTime(data.checkedAt)} · ${escapeHtml(data.detail)}\n`
        + `成功：${data.lastSuccessAt ? displayTime(data.lastSuccessAt) : '暂无'}`;
    } catch { return `⚠️ ${label}：状态存储读取失败`; }
  }));
  lines.push('', ...statuses.flatMap(line => [line, '']),
    '以上为最近调用记录，时间均为 UTC+8；KV 状态可能稍有延迟。',
    '缓存命中表示结果可用，不代表已检测上游。清除缓存后记录会重置。');
  return lines.join('\n');
}
