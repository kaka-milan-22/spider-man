const BINANCE_API = 'https://api.binance.com/api/v3/ticker/24hr';

const SYMBOLS = [
  { symbol: 'BTC', pair: 'BTCUSDT' },
  { symbol: 'ETH', pair: 'ETHUSDT' },
  { symbol: 'BNB', pair: 'BNBUSDT' },
  { symbol: 'SOL', pair: 'SOLUSDT' },
  { symbol: 'TON', pair: 'TONUSDT' },
  { symbol: 'TRX', pair: 'TRXUSDT' },
  { symbol: 'DOT', pair: 'DOTUSDT' },
  { symbol: 'LINK', pair: 'LINKUSDT' },
  { symbol: 'AVAX', pair: 'AVAXUSDT' },
];

export interface CryptoPrice {
  symbol: string;
  price: number;
  change24h: number;
}

interface BinanceTicker {
  symbol: string;
  lastPrice: string;
  priceChangePercent: string;
}

async function fetchTicker(pair: string): Promise<CryptoPrice | null> {
  try {
    const response = await fetch(`${BINANCE_API}?symbol=${pair}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; HNTelegramBot/1.0)',
      },
    });
    if (!response.ok) {
      console.warn(`Binance API error for ${pair}: ${response.status}`);
      return null;
    }
    const data = (await response.json()) as BinanceTicker;
    return {
      symbol: pair.replace('USDT', ''),
      price: parseFloat(data.lastPrice),
      change24h: parseFloat(data.priceChangePercent),
    };
  } catch (error) {
    console.warn(`Error fetching ${pair}:`, error);
    return null;
  }
}

export async function fetchCryptoPrices(): Promise<CryptoPrice[]> {
  const promises = SYMBOLS.map(async ({ symbol, pair }) => {
    const result = await fetchTicker(pair);
    return result ? { ...result, symbol } : null;
  });

  const results = await Promise.all(promises);
  return results.filter((p): p is CryptoPrice => p !== null);
}

export function formatCryptoPrices(prices: CryptoPrice[]): string {
  if (prices.length === 0) {
    return '❌ 获取价格失败，请稍后重试';
  }

  const maxSymbolLen = Math.max(...prices.map(p => p.symbol.length));

  const lines = prices.map((p) => {
    const symbol = p.symbol.padEnd(maxSymbolLen);
    const priceStr =
      p.price >= 1000
        ? p.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : p.price >= 1
          ? p.price.toFixed(2)
          : p.price.toFixed(4);
    const price = `$${priceStr}`.padStart(12);

    const changeStr = p.change24h >= 0
      ? `🟢 +${p.change24h.toFixed(2)}%`
      : `🔴 ${p.change24h.toFixed(2)}%`;

    return `${symbol}: ${price} ${changeStr}`;
  });

  return `📊 *加密货币行情*\n\n${lines.join('\n')}`;
}
