import { fetchYahooQuote, type MarketQuote } from './yahoo-finance';

export const PH_FUEL_SOURCE = 'https://gaswatchph.com/';
const DAY_MS = 86_400_000;
const OIL_SYMBOLS = [{ symbol: 'BZ=F', label: 'Brent' }, { symbol: 'CL=F', label: 'WTI' }];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

export interface PhilippineFuelPrices {
  gasoline: number;
  diesel: number;
  publishedAt: string;
}

export interface OilPrices {
  international: MarketQuote[];
  philippines: PhilippineFuelPrices | null;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function positive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

// Read the site's published average from JSON-LD; never execute remote JavaScript
// or confuse a cheapest-station price with the Metro Manila average.
export function parsePhilippineFuelPrices(html: string, now = Date.now()): PhilippineFuelPrices | null {
  for (const script of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi)) {
    let document: unknown;
    try { document = JSON.parse(script[1]); } catch { continue; }
    const documents = Array.isArray(document) ? document
      : record(document) && Array.isArray(document['@graph']) ? document['@graph'] : [document];
    for (const page of documents) {
      if (!record(page) || page['@type'] !== 'FAQPage' || !Array.isArray(page.mainEntity)) continue;
      for (const question of page.mainEntity) {
        if (!record(question) || typeof question.name !== 'string'
          || !/average fuel price in Metro Manila/i.test(question.name)
          || !record(question.acceptedAnswer) || typeof question.acceptedAnswer.text !== 'string') continue;
        const match = /^As of ([A-Za-z]+) (\d{1,2}), (\d{4}), the Metro Manila average diesel price is ₱(\d+(?:\.\d{1,2})?) per liter and unleaded is ₱(\d+(?:\.\d{1,2})?) per liter\b/i.exec(question.acceptedAnswer.text);
        if (!match) continue;
        const month = MONTHS.findIndex(value => value.toLowerCase() === match[1].toLowerCase());
        const day = Number(match[2]);
        const year = Number(match[3]);
        const date = new Date(Date.UTC(year, month, day));
        const todayInManila = Math.floor((now + 8 * 3_600_000) / DAY_MS) * DAY_MS;
        const diesel = Number(match[4]);
        const gasoline = Number(match[5]);
        if (month < 0 || year < 2000 || date.getUTCFullYear() !== year
          || date.getUTCMonth() !== month || date.getUTCDate() !== day
          || date.getTime() > todayInManila || !positive(diesel) || !positive(gasoline)) continue;
        return { gasoline, diesel, publishedAt: date.toISOString().slice(0, 10) };
      }
    }
  }
  return null;
}

async function fetchPhilippineFuelPrices(): Promise<PhilippineFuelPrices | null> {
  try {
    const options: RequestInit & { cache: 'no-store' } = {
      cache: 'no-store',
      headers: { Accept: 'text/html', 'Cache-Control': 'no-cache, no-store' },
      signal: AbortSignal.timeout(8000),
    };
    const response = await fetch(PH_FUEL_SOURCE, options);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const prices = parsePhilippineFuelPrices(await response.text());
    if (!prices) console.warn('Philippine fuel source has no valid dated Metro Manila average');
    return prices;
  } catch {
    console.warn('Philippine fuel price request failed');
    return null;
  }
}

export async function fetchOilPrices(): Promise<OilPrices> {
  const [international, philippines] = await Promise.all([
    Promise.all(OIL_SYMBOLS.map(({ symbol }) => fetchYahooQuote(symbol))),
    fetchPhilippineFuelPrices(),
  ]);
  return { international, philippines };
}

export function formatOilPrices(prices: OilPrices, now = Date.now()): string {
  const formatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  const lines = ['<b>🛢 国际原油 · USD/桶 · Futures</b>', ''];
  for (const { symbol, label } of OIL_SYMBOLS) {
    const quote = prices.international.find(item => item.symbol === symbol);
    if (!quote || quote.price === null) {
      lines.push(`<code>${label.padEnd(5)}: 暂无报价</code>`);
      continue;
    }
    const change = quote.changePercent === null ? '涨跌幅暂无'
      : `${quote.changePercent >= 0 ? '🟢 +' : '🔴 '}${quote.changePercent.toFixed(2)}%`;
    lines.push(`<code>${label.padEnd(5)}: $${quote.price.toFixed(2).padEnd(8)} ${change}</code>`);
    if (quote.updatedAt !== null) lines.push(`报价：${formatter.format(new Date(quote.updatedAt * 1000))} UTC+8`);
  }
  lines.push('来源：Yahoo Finance · 可能有延迟', '', '<b>⛽ 菲律宾 · Metro Manila / NCR</b>', '');
  const ph = prices.philippines;
  if (ph) {
    lines.push(`<code>Unleaded 91: ₱${ph.gasoline.toFixed(2)}/L</code>`,
      `<code>Diesel     : ₱${ph.diesel.toFixed(2)}/L</code>`, '',
      `数据日期：${ph.publishedAt} · 每周平均参考价`);
    if (now - Date.parse(`${ph.publishedAt}T00:00:00+08:00`) >= 14 * DAY_MS) {
      lines.push('⚠️ 数据已超过 14 天，请核对来源最新公告');
    }
    lines.push('各加油站实际售价可能不同');
  } else {
    lines.push('暂无可验证的菲律宾油价，请稍后重试');
  }
  lines.push(`来源：<a href="${PH_FUEL_SOURCE}">GasWatch PH</a>（DOE 公告与社区数据汇总）`);
  return lines.join('\n');
}
