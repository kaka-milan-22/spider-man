const COINBASE_API = 'https://api.exchange.coinbase.com/products';

const SYMBOLS = [
  { symbol: 'BTC', pair: 'BTC-USD' },
  { symbol: 'ETH', pair: 'ETH-USD' },
  { symbol: 'BNB', pair: 'BNB-USD' },
  { symbol: 'SOL', pair: 'SOL-USD' },
  { symbol: 'TON', pair: 'TON-USD' },
  { symbol: 'DOT', pair: 'DOT-USD' },
  { symbol: 'LINK', pair: 'LINK-USD' },
  { symbol: 'AVAX', pair: 'AVAX-USD' },
  { symbol: 'UNI', pair: 'UNI-USD' },
  { symbol: 'AAVE', pair: 'AAVE-USD' },
];

export interface CryptoPrice {
  symbol: string;
  price: number;
  change24h: number;
}

interface CoinbaseStats {
  open: string;
  last: string;
}

async function fetchStatsWithRetry(
  pair: string,
  maxRetries = 3,
  baseDelay = 500
): Promise<CryptoPrice | null> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(`${COINBASE_API}/${pair}/stats`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; HNTelegramBot/1.0)',
        },
      });
      if (!response.ok) {
        // Don't retry on 404s or client errors
        if (response.status >= 400 && response.status < 500 && response.status !== 429) {
          console.warn(`Coinbase API error for ${pair}: ${response.status} (no retry)`);
          return null;
        }
        console.warn(
          `Coinbase API error for ${pair}: ${response.status} (attempt ${attempt}/${maxRetries})`
        );
        throw new Error(`HTTP ${response.status}`);
      }
      const data = (await response.json()) as CoinbaseStats;
      const open = parseFloat(data.open);
      const last = parseFloat(data.last);
      const change24h = open > 0 ? ((last - open) / open) * 100 : 0;
      if (attempt > 1) {
        console.log(`Successfully fetched ${pair} on attempt ${attempt}`);
      }
      return {
        symbol: pair.split('-')[0],
        price: last,
        change24h,
      };
    } catch (error) {
      const isLastAttempt = attempt === maxRetries;
      console.warn(
        `Error fetching ${pair} (attempt ${attempt}/${maxRetries}):`,
        error instanceof Error ? error.message : error
      );

      if (isLastAttempt) {
        return null;
      }

      // Exponential backoff: 500ms, 1000ms, 2000ms
      const delay = baseDelay * Math.pow(2, attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  return null;
}

async function fetchStats(pair: string): Promise<CryptoPrice | null> {
  return fetchStatsWithRetry(pair);
}

export async function fetchCryptoPrices(): Promise<CryptoPrice[]> {
  const promises = SYMBOLS.map(async ({ symbol, pair }) => {
    const result = await fetchStats(pair);
    return result ? { ...result, symbol } : null;
  });

  const results = await Promise.all(promises);
  return results.filter((p): p is CryptoPrice => p !== null);
}

export function formatCryptoPrices(prices: CryptoPrice[]): string {
  if (prices.length === 0) {
    return '❌ 获取价格失败，请稍后重试';
  }

  const lines = prices.map((p) => {
    const priceStr =
      p.price >= 1000
        ? p.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : p.price >= 1
          ? p.price.toFixed(2)
          : p.price.toFixed(4);

    const changeStr =
      p.change24h >= 0 ? `🟢 +${p.change24h.toFixed(2)}%` : `🔴 ${p.change24h.toFixed(2)}%`;

    return `<code>${p.symbol.padEnd(4)}: $${priceStr.padEnd(10)} ${changeStr}</code>`;
  });

  return `<b>📊 加密货币行情</b>

${lines.join('\n')}`;
}
