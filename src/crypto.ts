const COINBASE_API = 'https://api.exchange.coinbase.com/products';
const COINGECKO_API = 'https://api.coingecko.com/api/v3/simple/price';
const TIMEOUT_MS = 4000;
const MAX_AGE_SECONDS = 300;

const SYMBOLS = [
  { symbol: 'BTC', id: 'bitcoin' }, { symbol: 'ETH', id: 'ethereum' },
  { symbol: 'BNB', id: 'binancecoin' }, { symbol: 'SOL', id: 'solana' },
  { symbol: 'TON', id: 'the-open-network' }, { symbol: 'DOT', id: 'polkadot' },
  { symbol: 'LINK', id: 'chainlink' }, { symbol: 'AVAX', id: 'avalanche-2' },
  { symbol: 'UNI', id: 'uniswap' }, { symbol: 'AAVE', id: 'aave' },
];
type Coin = typeof SYMBOLS[number];
export interface CryptoPrice {
  symbol: string;
  price: number | null;
  change24h: number | null;
  source?: 'CoinGecko' | 'Coinbase';
  updatedAt?: number;
  error?: string;
}
interface GeckoQuote { usd?: unknown; usd_24h_change?: unknown; last_updated_at?: unknown }
interface GeckoResult { quotes: CryptoPrice[]; retry: boolean; delay: number; error?: string }
const pause = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
function positive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}
function retryDelay(response: Response, fallback: number): number {
  const raw = response.headers.get('Retry-After');
  if (!raw) return fallback;
  const seconds = Number(raw);
  const value = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(raw) - Date.now();
  return Number.isFinite(value) ? Math.max(0, value) : fallback;
}
async function fetchGecko(coins: Coin[], apiKey?: string): Promise<GeckoResult> {
  try {
    const url = new URL(COINGECKO_API);
    url.searchParams.set('ids', coins.map(coin => coin.id).join(','));
    url.searchParams.set('vs_currencies', 'usd');
    url.searchParams.set('include_24hr_change', 'true');
    url.searchParams.set('include_last_updated_at', 'true');
    const headers: Record<string, string> = { Accept: 'application/json', 'User-Agent': 'SpiderManMarketBot/1.0' };
    if (apiKey?.trim()) headers['x-cg-demo-api-key'] = apiKey.trim();
    const options: RequestInit & { cache: 'no-store' } = { headers, cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT_MS) };
    const response = await fetch(url.toString(), options);
    if (!response.ok) {
      const delay = retryDelay(response, 500);
      return { quotes: [], retry: (response.status === 429 || response.status >= 500) && delay <= 1000,
        delay, error: 'CoinGecko HTTP ' + response.status };
    }
    const data = await response.json() as Record<string, GeckoQuote>;
    const now = Date.now() / 1000;
    const quotes: CryptoPrice[] = [];
    for (const coin of coins) {
      const q = data?.[coin.id];
      if (!positive(q?.usd) || !positive(q?.last_updated_at)
        || !Number.isSafeInteger(q.last_updated_at) || now - q.last_updated_at > MAX_AGE_SECONDS
        || q.last_updated_at - now > 30) continue;
      quotes.push({ symbol: coin.symbol, price: q.usd,
        change24h: typeof q.usd_24h_change === 'number' && Number.isFinite(q.usd_24h_change) ? q.usd_24h_change : null,
        source: 'CoinGecko', updatedAt: q.last_updated_at });
    }
    return { quotes, retry: true, delay: 500, error: 'CoinGecko quote unavailable or stale' };
  } catch { return { quotes: [], retry: true, delay: 500, error: 'CoinGecko request failed' }; }
}
async function fetchCoinbase(coin: Coin, attempts: number): Promise<CryptoPrice> {
  let reason = 'Coinbase request failed';
  for (let attempt = 0; attempt < attempts; attempt++) {
    let delay = 500;
    try {
      const options: RequestInit & { cache: 'no-store' } = {
        headers: { Accept: 'application/json', 'User-Agent': 'SpiderManMarketBot/1.0' },
        cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT_MS),
      };
      const response = await fetch(COINBASE_API + '/' + coin.symbol + '-USD/stats', options);
      if (!response.ok) {
        delay = retryDelay(response, 500);
        throw new Error('Coinbase HTTP ' + response.status);
      }
      const data = await response.json() as { open?: unknown; last?: unknown };
      const parse = (value: unknown) => typeof value === 'string' && value.trim() ? Number(value) : NaN;
      const price = parse(data?.last);
      const open = parse(data?.open);
      if (!Number.isFinite(price) || price <= 0) throw new Error('Coinbase invalid quote');
      const change = Number.isFinite(open) && open > 0 ? ((price - open) / open) * 100 : null;
      return { symbol: coin.symbol, price, change24h: change !== null && Number.isFinite(change) ? change : null, source: 'Coinbase' };
    } catch (error) {
      // Never log raw fetch errors or credential-bearing request objects.
      const message = error instanceof Error ? error.message : '';
      reason = /^Coinbase (HTTP [0-9]{3}|invalid quote)$/.test(message) ? message : 'Coinbase request failed';
      if (attempt + 1 < attempts && delay <= 1000) await pause(delay + Math.floor(Math.random() * 150));
      else break;
    }
  }
  console.warn('Crypto unavailable: ' + coin.symbol + ' (' + reason + ')');
  return { symbol: coin.symbol, price: null, change24h: null, error: reason };
}

export async function fetchCryptoPrices(options: { coinGeckoApiKey?: string } = {}): Promise<CryptoPrice[]> {
  const quotes = new Map<string, CryptoPrice>();
  let pending = SYMBOLS;
  let primaryAttempts = 0;
  for (let round = 0; round < 2 && pending.length; round++) {
    const result = await fetchGecko(pending, options.coinGeckoApiKey);
    primaryAttempts++;
    for (const quote of result.quotes) quotes.set(quote.symbol, quote);
    pending = pending.filter(coin => !quotes.has(coin.symbol));
    if (!pending.length || !result.retry) break;
    if (round === 0) await pause(result.delay + Math.floor(Math.random() * 150));
  }
  // One coin gets at most three attempts across both providers, never three per provider.
  // Pace fallback chunks to reduce per-IP bursts on shared Worker egress.
  for (let start = 0; start < pending.length; start += 4) {
    if (start > 0) await pause(600 + Math.floor(Math.random() * 150));
    const chunk = pending.slice(start, start + 4);
    const fallback = await Promise.all(chunk.map(coin => fetchCoinbase(coin, 3 - primaryAttempts)));
    for (const quote of fallback) quotes.set(quote.symbol, quote);
  }
  return SYMBOLS.map(coin => quotes.get(coin.symbol) || { symbol: coin.symbol, price: null, change24h: null });
}

export function formatCryptoPrices(prices: CryptoPrice[]): string {
  if (prices.length === 0) {
    return '❌ 获取价格失败，请稍后重试';
  }

  const lines = prices.map((p) => {
    if (p.price === null) return `<code>${p.symbol.padEnd(4)}: 暂无报价</code>`;
    const priceStr =
      p.price >= 1000
        ? p.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : p.price >= 1
          ? p.price.toFixed(2)
          : p.price.toFixed(4);

    const changeStr = p.change24h === null ? '涨跌幅暂无'
      : p.change24h >= 0 ? `🟢 +${p.change24h.toFixed(2)}%` : `🔴 ${p.change24h.toFixed(2)}%`;

    return `<code>${p.symbol.padEnd(4)}: $${priceStr.padEnd(10)} ${changeStr}</code>${p.source === 'Coinbase' ? ' <i>Coinbase</i>' : ''}`;
  });

  return `<b>📊 加密货币行情</b>

${lines.join('\n')}\n\n来源：CoinGecko（主） / Coinbase（备用） · USD`;
}
