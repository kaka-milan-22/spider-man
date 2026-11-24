import { readCache, writeCache, withTimeout } from './storage';
import type { Env } from './types';
import { getConfig } from './config';
import { displayTime, escapeHtml } from './display';
import { CRYPTO_SYMBOLS, fetchCryptoPrices, type CryptoPrice } from './crypto';
import { STOCK_SYMBOLS, fetchStockPrices } from './stocks';
import { fetchMarketOverview, MARKET_INSTRUMENTS } from './market';
import { fetchOilPrices, type OilPrices } from './oil';
import { fetchCalendar, CALENDAR_SOURCES, type CalendarResult } from './calendar';
import { fetchExchangeRates, type ExchangeRates } from './exrate-api';
import type { MarketQuote } from './yahoo-finance';
import { sendMessage } from './telegram';
import { BRIEF_CSS, BRIEF_NAV_SCRIPT } from './brief-style';
import { STOCK_LOGOS } from './stock-logos';
import { CRYPTO_LOGOS } from './crypto-logos';

export const BRIEF_TTL = 86400;
export const BRIEF_RETENTION_TTL = 7 * 86400;
// Refresh the latest report after the watchlist change; historical snapshots stay readable.
export const BRIEF_LATEST_KEY = 'brief:v2:latest';
export const BRIEF_REPORT_PREFIX = 'brief:v1:report:';
const BRIEF_SNAPSHOT_WRITE_TIMEOUT_MS = 10_000;

export class BriefSnapshotTimeoutError extends Error {
  constructor() {
    super('日报快照写入 Cloudflare Workers KV 超时（' + BRIEF_SNAPSHOT_WRITE_TIMEOUT_MS / 1000 + ' 秒），Worker 未能确认保存成功。');
    this.name = 'BriefSnapshotTimeoutError';
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SECTIONS = [
  ['market', '市场概览', '/market'], ['crypto', 'Crypto 行情', '/btc'],
  ['stocks', '股票', '/stocks'], ['exrate', 'USD 汇率', '/exrate'],
  ['oil', '原油与油价', '/oil'], ['calendar', '经济日程', '/calendar'],
] as const;
const CURRENCIES = [
  ['PHP', '🇵🇭'], ['CNY', '🇨🇳'], ['MYR', '🇲🇾'], ['TWD', '🇹🇼'],
  ['HKD', '🇭🇰'], ['THB', '🇹🇭'], ['VND', '🇻🇳'],
] as const;

export interface BriefData {
  market: MarketQuote[] | null;
  crypto: CryptoPrice[] | null;
  stocks: MarketQuote[] | null;
  exrate: ExchangeRates | null;
  oil: OilPrices | null;
  calendar: CalendarResult | null;
}
export interface BriefReport {
  version: 1;
  id: string;
  generatedAt: number;
  html: string;
  summary: string;
}

function number(value: number | null | undefined, digits = 2): string {
  return typeof value === 'number' && Number.isFinite(value)
    ? value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }) : '暂无';
}
function change(value: number | null | undefined, unit = '%'): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '<span class="muted">暂无</span>';
  const direction = value >= 0 ? 'up' : 'down';
  return `<span class="change ${direction}">${value >= 0 ? '+' : '−'}${number(Math.abs(value), unit === ' bp' ? 1 : 2)}${unit}</span>`;
}
function time(value: number | null | undefined): string {
  return value && Number.isFinite(value) ? displayTime(value * 1000) : '时间暂无';
}
function rateTime(value?: string): string {
  const timestamp = value ? Date.parse(value.replace(/ UTC$/, 'Z').replace(' ', 'T')) : NaN;
  return Number.isFinite(timestamp) ? displayTime(timestamp) : '暂无';
}
function table(headings: string[], rows: string[]): string {
  return `<div class="table-wrap"><table><thead><tr>${headings.map(h => `<th scope="col">${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
}
function section(id: string, title: string, command: string, note: string, body: string): string {
  return `<section id="${id}"><div class="section-head"><h2>${title}</h2><span class="command">${command}</span></div><p class="section-note">${note}</p>${body}</section>`;
}
const missing = '<p class="muted">本次数据获取失败，暂无数据。</p>';

export function renderBrief(data: BriefData, generatedAt: number): string {
  const timestamp = displayTime(generatedAt);
  const market = data.market ? `<div class="market-grid">${MARKET_INSTRUMENTS.map(({ symbol, label }) => {
    const quote = data.market!.find(q => q.symbol === symbol);
    const yieldQuote = symbol === '^TNX';
    const delta = yieldQuote
      ? quote?.price != null && quote.previousClose != null ? (quote.price - quote.previousClose) * 100 : null
      : quote?.changePercent;
    return `<div class="metric"><div class="metric-label">${label}</div><div class="metric-value">${number(quote?.price, yieldQuote ? 3 : 2)}${yieldQuote && quote?.price != null ? '%' : ''}</div><div>${change(delta, yieldQuote ? ' bp' : '%')}</div><div class="time">${time(quote?.updatedAt)}</div></div>`;
  }).join('')}</div><p class="footnote">变化相对前收盘。US 10Y 为收益率，1 bp = 0.01 个百分点。来源：Yahoo Finance，报价可能延迟。</p>` : missing;
  const crypto = data.crypto ? table(['资产', '价格 / USD', '24h'], data.crypto.map(q =>
    `<tr><td class="symbol">${CRYPTO_LOGOS[q.symbol] ? `<img class="stock-logo" alt="" src="${CRYPTO_LOGOS[q.symbol]}">` : ''}${escapeHtml(q.symbol)}<span class="asset-name">${q.updatedAt ? time(q.updatedAt) : displayTime(generatedAt)}</span></td><td>${q.price === null ? '暂无报价' : number(q.price, q.price < 1 ? 4 : 2)}</td><td>${change(q.change24h)}</td></tr>`))
    + '<p class="footnote">CoinGecko 聚合 USD 行情为主，Coinbase USD 报价为备用；不同来源的数值可能略有差异。PAXG 为 PAX Gold，价格单位为 USD / token。每个币种合计最多尝试 3 次，失败显示“暂无报价”，不使用旧价格兜底。</p>' : missing;
  const stocks = data.stocks ? table(['资产', '价格 / USD', '日涨跌'], data.stocks.map(q =>
    `<tr><td class="symbol">${STOCK_LOGOS[q.symbol] ? `<img class="stock-logo" alt="" src="${STOCK_LOGOS[q.symbol]}">` : ''}${escapeHtml(q.symbol)}<span class="asset-name">${time(q.updatedAt)}</span></td><td>${q.price === null ? '暂无报价' : number(q.price)}</td><td>${change(q.changePercent)}</td></tr>`))
    + '<p class="footnote">来源：Yahoo Finance · regular trading session，休市时显示最近一次报价。ANT 为 Anthropic；尚无实际交易报价时显示“暂无报价”。</p>' : missing;
  const rates = data.exrate ? table(['币种', '1 USD 可兑换'], CURRENCIES.map(([code, flag]) =>
    `<tr><td class="symbol">${flag} ${code}</td><td>${number(data.exrate![code])}</td></tr>`))
    + `<p class="footnote">来源：currencyapi.com · 源更新时间：${rateTime(data.exrate.updatedAt)}。不等于银行或兑换商的实际成交价。</p>` : missing;
  let oil = missing;
  if (data.oil) {
    oil = table(['Futures', 'USD / 桶', '日涨跌'], [['BZ=F', 'Brent'], ['CL=F', 'WTI']].map(([symbol, label]) => {
      const q = data.oil!.international.find(item => item.symbol === symbol);
      return `<tr><td class="symbol">${label}<span class="asset-name">${time(q?.updatedAt)}</span></td><td>${q?.price == null ? '暂无报价' : number(q.price)}</td><td>${change(q?.changePercent)}</td></tr>`;
    })) + '<p class="footnote">来源：Yahoo Finance · Futures 报价可能延迟。</p>';
    const ph = data.oil.philippines;
    oil += `<div class="fuel"><h3 style="margin-top:0">🇵🇭 Metro Manila / NCR</h3>${ph
      ? `<div class="fuel-row"><span>Unleaded 91</span><strong>₱${number(ph.gasoline)} <small>/ L</small></strong></div><div class="fuel-row"><span>Diesel</span><strong>₱${number(ph.diesel)} <small>/ L</small></strong></div><p class="footnote">数据日期：${escapeHtml(ph.publishedAt)} · 每周区域平均参考价，各站实际售价可能不同。${generatedAt - Date.parse(ph.publishedAt + 'T00:00:00+08:00') >= 14 * 86400000 ? '⚠️ 数据已超过 14 天，请核对来源最新公告。' : ''}</p>`
      : '<p class="muted">暂无可验证的菲律宾油价。</p>'}</div><p class="footnote">菲律宾油价来源：<a href="https://gaswatchph.com/">GasWatch PH</a></p>`;
  }
  let calendar = missing;
  if (data.calendar) {
    const failed = data.calendar.sources.filter(s => !s.ok);
    calendar = data.calendar.events.map(event => {
      const date = displayTime(event.time);
      return `<div class="event"><div class="event-date">${date.slice(5, 10).replace('-', '/')}<span>${date.slice(11)}</span></div><div><div class="event-title">${escapeHtml(event.title)}</div><div class="event-meta">${event.source}</div>${event.estimatedTime ? '<span class="event-tag">按通常发布时刻换算，以公告为准</span>' : ''}</div></div>`;
    }).join('') || `<p class="muted">${failed.length ? '可用数据源中暂无事件，日程可能不完整。' : '此期间暂无上述四类已公布事件。'}</p>`;
    if (failed.length) calendar += `<div class="notice">${failed.map(s => s.source).join(' / ')} 暂不可用或日程未覆盖该期间，日程可能不完整。</div>`;
    calendar += '<p class="footnote">按时间排序，处理 US DST 与假期调整。官方来源：'
      + Object.entries(CALENDAR_SOURCES).map(([label, url]) => `<a href="${url}">${label}</a>`).join(' / ') + '</p>';
  }
  const bodies = { market, crypto, stocks, exrate: rates, oil, calendar };
  const notes = {
    market: '指数点位与 US Treasury yield', crypto: 'USD 报价 · 24h 涨跌', stocks: 'USD / 股 · 相对前收盘涨跌',
    exrate: '1 USD 可兑换的对应货币金额', oil: '国际 Futures 与 Metro Manila / NCR 参考价', calendar: '未来 7 天',
  };
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="color-scheme" content="dark"><meta name="robots" content="noindex,nofollow"><title>每日市场简报 · ${timestamp}</title><style>${BRIEF_CSS}</style></head><body id="top"><main>
<header><div class="brand">Spider-Man</div><h1>每日市场简报</h1><p class="meta">${timestamp.replace(/-/g, '.').replace(' ', ' · ')} UTC+8</p><div class="direction-key"><span class="up"><i aria-hidden="true"></i>上涨 +</span><span class="down"><i aria-hidden="true"></i>下跌 −</span></div><p class="intro">市场、关注资产与经济日程，一页看完。</p><p class="footnote">这是生成时的数据快照，价格与日程不会随页面刷新更新。具体报价时间以各数据源标注为准。</p></header>
<nav aria-label="简报板块">${SECTIONS.map(([id, title], i) => `<a href="#${id}"${i === 0 ? ' aria-current="location"' : ''}>${title}</a>`).join('')}</nav>
${SECTIONS.map(([id, title, command]) => section(id, title, command, notes[id], bodies[id])).join('\n')}
<footer><p>Spider-Man 每日市场简报 · 生成于 ${timestamp}</p><p>每日 11:00 更新；/brief 使用 24 小时内缓存。历史简报自生成起保留 7 天，群消息中的原链接可查看当时的快照。</p><a class="back" href="#top">返回顶部 ↑</a></footer></main><script src="/brief-nav.js" defer></script></body></html>`;
}

function incomplete(data: BriefData): string[] {
  const quotesOk = (quotes: Array<{ price: number | null }> | null, count: number) =>
    quotes?.length === count && quotes.every(q => q.price !== null);
  return [
    !quotesOk(data.market, 5) && '市场概览', !quotesOk(data.crypto, CRYPTO_SYMBOLS.length) && 'Crypto',
    !quotesOk(data.stocks, STOCK_SYMBOLS.length) && '股票', !data.exrate && '汇率',
    (!data.oil || !quotesOk(data.oil.international, 2) || !data.oil.philippines) && '油价',
    (!data.calendar || data.calendar.sources.some(s => !s.ok)) && '经济日程',
  ].filter((item): item is string => typeof item === 'string');
}

async function fetchData(env: Env): Promise<BriefData> {
  const safe = async <T>(name: string, action: () => Promise<T>): Promise<T | null> => {
    try { return await withTimeout(action, 12000); } catch { console.warn(`Brief source unavailable: ${name}`); return null; }
  };
  // A newly generated brief always requests upstream data, including currency rates.
  const [market, crypto, stocks, exrate, oil, calendar] = await Promise.all([
    safe('market', fetchMarketOverview), safe('crypto', () => fetchCryptoPrices({ coinGeckoApiKey: env.COINGECKO_API_KEY })), safe('stocks', fetchStockPrices),
    safe('exrate', () => {
      if (!env.CURRENCY_API_KEY?.trim()) throw new Error('Missing Currency API key');
      return fetchExchangeRates(env.CURRENCY_API_KEY.trim(), env.HN_STORIES, { forceRefresh: true });
    }),
    safe('oil', fetchOilPrices), safe('calendar', () => fetchCalendar(7)),
  ]);
  return { market, crypto, stocks, exrate, oil, calendar };
}

function validReport(value: unknown, now: number): value is BriefReport {
  const r = value as BriefReport | null;
  return !!r && r.version === 1 && typeof r.id === 'string' && UUID.test(r.id)
    && Number.isFinite(r.generatedAt) && r.generatedAt <= now && now - r.generatedAt < BRIEF_RETENTION_TTL * 1000
    && typeof r.html === 'string' && typeof r.summary === 'string';
}

export async function readBrief(kv: KVNamespace, id: string, now = Date.now()): Promise<BriefReport | null> {
  if (!UUID.test(id)) return null;
  const report = await withTimeout(() => kv.get<BriefReport>(BRIEF_REPORT_PREFIX + id, 'json'));
  return validReport(report, now) && report.id === id ? report : null;
}

async function generateBrief(env: Env): Promise<BriefReport> {
  const data = await fetchData(env);
  const generatedAt = Date.now();
  const missingSections = incomplete(data);
  const btc = data.crypto?.find(q => q.symbol === 'BTC');
  const summary = [
    '<b>📋 每日市场简报</b>', `${displayTime(generatedAt)} UTC+8`, '',
    btc?.price != null ? `BTC：$${number(btc.price)}` : 'BTC：暂无报价',
    data.exrate ? `1 USD = ${number(data.exrate.PHP)} PHP / ${number(data.exrate.CNY)} CNY` : 'USD 汇率：暂无',
    '', '市场概览 · Crypto · 股票', 'USD 汇率 · 原油与油价 · 经济日程',
    ...(missingSections.length ? ['', `⚠️ 部分数据缺失：${missingSections.join('、')}`] : []),
    '', '点击下方按钮查看完整简报。', '历史简报保留 7 天，原链接可查看当时的快照。',
  ].join('\n');
  const report: BriefReport = { version: 1, id: crypto.randomUUID(), generatedAt, html: renderBrief(data, generatedAt), summary };
  // Keep immutable snapshots so previous Telegram buttons never open a different report.
  try {
    await withTimeout(
      () => env.HN_STORIES.put(BRIEF_REPORT_PREFIX + report.id, JSON.stringify(report), { expirationTtl: BRIEF_RETENTION_TTL }),
      BRIEF_SNAPSHOT_WRITE_TIMEOUT_MS,
    );
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') throw new BriefSnapshotTimeoutError();
    throw error;
  }
  await writeCache(() => env.HN_STORIES.put(BRIEF_LATEST_KEY, report.id, { expirationTtl: BRIEF_TTL }));
  return report;
}

// Coalesce overlapping manual requests within one isolate; cron always regenerates.
const inFlight = new WeakMap<KVNamespace, Promise<BriefReport>>();
export async function getBrief(env: Env, forceRefresh = false): Promise<BriefReport> {
  if (forceRefresh) return generateBrief(env);
  const id = await readCache(() => env.HN_STORIES.get(BRIEF_LATEST_KEY));
  if (id) {
    const cached = await readCache(() => readBrief(env.HN_STORIES, id));
    if (cached && Date.now() - cached.generatedAt < BRIEF_TTL * 1000) return cached;
  }
  const pending = inFlight.get(env.HN_STORIES);
  if (pending) return pending;
  const generation = generateBrief(env);
  inFlight.set(env.HN_STORIES, generation);
  try { return await generation; } finally { inFlight.delete(env.HN_STORIES); }
}

function baseUrl(env: Env, requestOrigin?: string): string {
  const url = new URL(env.BRIEF_BASE_URL || requestOrigin || '');
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('BRIEF_BASE_URL must be an HTTPS origin');
  }
  return url.origin;
}

export async function sendBrief(env: Env, forceRefresh = false, requestOrigin?: string): Promise<string> {
  const config = getConfig(env);
  const origin = baseUrl(env, requestOrigin);
  const report = await getBrief(env, forceRefresh);
  const url = `${origin}/brief/${report.id}`;
  await sendMessage(config.telegramBotToken, config.telegramChatId, report.summary, {
    disableLinkPreview: true,
    button: { text: '查看完整简报', url },
  });
  return url;
}

export async function serveBrief(request: Request, env: Env): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  if (path !== '/brief-nav.js' && !path.startsWith('/brief/')) return null;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
  }
  const headers = {
    'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow',
    'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
  };
  if (path === '/brief-nav.js') return new Response(request.method === 'HEAD' ? null : BRIEF_NAV_SCRIPT, {
    headers: { ...headers, 'Content-Type': 'text/javascript; charset=utf-8' },
  });
  const id = path.slice('/brief/'.length);
  let report: BriefReport | null;
  try { report = await readBrief(env.HN_STORIES, id); }
  catch {
    return new Response(request.method === 'HEAD' ? null : '简报存储暂时不可用，请稍后重试。', {
      status: 503, headers: { ...headers, 'Content-Type': 'text/plain; charset=utf-8', 'Retry-After': '30' },
    });
  }
  if (!report) return new Response(request.method === 'HEAD' ? null : '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>简报已过期</title><body style="background:#16181c;color:#e4e4e2;font:18px/1.8 -apple-system,sans-serif;padding:28px"><h1>简报已过期或不存在</h1><p>请回到 Telegram 群，发送 /brief 获取简报。</p></body></html>', {
    status: 410, headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' },
  });
  return new Response(request.method === 'HEAD' ? null : report.html, { headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' } });
}
