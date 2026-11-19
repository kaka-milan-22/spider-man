import { CRYPTO_SYMBOLS, fetchCryptoPrice, type CryptoPrice } from './crypto';
import { displayTime, escapeHtml } from './display';

interface CoinMatch { id: string; symbol: string; name: string; market_cap_rank?: number | null }
export type CoinResult =
  | { status: 'not-found' }
  | { status: 'unavailable' }
  | { status: 'found'; coin: CoinMatch; quote: CryptoPrice };

function isCoin(value: unknown): value is CoinMatch {
  if (!value || typeof value !== 'object') return false;
  const coin = value as CoinMatch;
  return typeof coin.id === 'string' && /^[a-z0-9][a-z0-9._-]{0,199}$/i.test(coin.id)
    && typeof coin.symbol === 'string' && coin.symbol.length > 0 && coin.symbol.length <= 80
    && typeof coin.name === 'string' && coin.name.length > 0 && coin.name.length <= 200;
}

export async function lookupCoin(input = '', options: { coinGeckoApiKey?: string } = {}): Promise<CoinResult> {
  const query = (input.trim() || 'BTC').replace(/^\$/, '').toLowerCase();
  if (!/^[\p{L}\p{N}][\p{L}\p{N} ._-]{0,79}$/u.test(query)) return { status: 'not-found' };
  const known = CRYPTO_SYMBOLS.find(coin => coin.symbol.toLowerCase() === query || coin.id === query);
  let coin: CoinMatch;
  if (known) {
    coin = { ...known, name: known.id };
  } else {
    try {
      const url = new URL('https://api.coingecko.com/api/v3/search');
      url.searchParams.set('query', query);
      const headers: Record<string, string> = { Accept: 'application/json', 'User-Agent': 'SpiderManMarketBot/1.0' };
      if (options.coinGeckoApiKey?.trim()) headers['x-cg-demo-api-key'] = options.coinGeckoApiKey.trim();
      const requestOptions: RequestInit & { cache: 'no-store' } = {
        headers, cache: 'no-store', signal: AbortSignal.timeout(4000),
      };
      const response = await fetch(url.toString(), requestOptions);
      if (!response.ok) return { status: 'unavailable' };
      const data = await response.json() as { coins?: unknown[] };
      if (!Array.isArray(data?.coins) || !data.coins.every(isCoin)) return { status: 'unavailable' };
      // Require an exact match; fuzzy results must not silently select another asset.
      const matches = data.coins.filter(c => [c.id, c.symbol, c.name].some(v => v.toLowerCase() === query));
      const rank = (c: CoinMatch) => Number.isSafeInteger(c.market_cap_rank) && c.market_cap_rank! > 0
        ? c.market_cap_rank! : Infinity;
      matches.sort((a, b) => Number(b.id.toLowerCase() === query) - Number(a.id.toLowerCase() === query)
        || rank(a) - rank(b) || a.id.localeCompare(b.id));
      if (!matches.length) return { status: 'not-found' };
      coin = matches[0];
    } catch { return { status: 'unavailable' }; }
  }
  const quote = await fetchCryptoPrice({ id: coin.id, symbol: coin.symbol.toUpperCase() }, options);
  return { status: 'found', coin, quote };
}

export function formatCoin(result: CoinResult): string {
  if (result.status === 'not-found') return '找不到这个币';
  if (result.status === 'unavailable') return '❌ 行情服务暂时不可用，请稍后重试';
  const { coin, quote } = result;
  const title = `<b>📊 ${escapeHtml(quote.symbol)}</b>\n${escapeHtml(coin.name)} · <code>${escapeHtml(coin.id)}</code>`;
  if (quote.price === null) return `${title}\n\n暂无报价，请稍后重试`;
  // Keep small-token prices meaningful instead of rounding them to $0.0000.
  const price = quote.price.toLocaleString('en-US', {
    minimumFractionDigits: 2, maximumFractionDigits: quote.price >= 1 ? 2 : 12,
    ...(quote.price < 1e-12 ? { notation: 'scientific', maximumFractionDigits: 6 } : {}),
  });
  const change = quote.change24h === null ? '暂无'
    : `${quote.change24h >= 0 ? '🟢 +' : '🔴 '}${quote.change24h.toFixed(2)}%`;
  return `${title}\n\n价格：$${price} USD\n24h 涨跌幅：${change}\n\n来源：${quote.source}`
    + (quote.updatedAt ? `\n报价：${displayTime(quote.updatedAt * 1000)} UTC+8` : '');
}
