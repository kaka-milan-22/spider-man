const BINANCE_API = 'https://api.binance.com/api/v3/ticker/price';

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

interface BinancePrice {
  symbol: string;
  price: string;
}

export interface CryptoPrice {
  symbol: string;
  price: number;
}

async function fetchPrice(pair: string): Promise<number | null> {
  try {
    const response = await fetch(`${BINANCE_API}?symbol=${pair}`);
    if (!response.ok) {
      console.warn(`Failed to fetch ${pair}: ${response.status}`);
      return null;
    }
    const data = (await response.json()) as BinancePrice;
    return parseFloat(data.price);
  } catch (error) {
    console.warn(`Error fetching ${pair}:`, error);
    return null;
  }
}

export async function fetchCryptoPrices(): Promise<CryptoPrice[]> {
  const results: CryptoPrice[] = [];

  const promises = SYMBOLS.map(async ({ symbol, pair }) => {
    const price = await fetchPrice(pair);
    return price !== null ? { symbol, price } : null;
  });

  const prices = await Promise.all(promises);

  for (const p of prices) {
    if (p) {
      results.push(p);
    }
  }

  return results;
}

export function formatCryptoPrices(prices: CryptoPrice[]): string {
  const lines = prices.map((p) => {
    const formatted =
      p.price >= 1000
        ? p.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : p.price >= 1
          ? p.price.toFixed(4)
          : p.price.toFixed(6);
    return `${p.symbol}: $${formatted}`;
  });

  return `📊 *加密货币行情*\n\n${lines.join('\n')}`;
}
