const COINGECKO_API = 'https://api.coingecko.com/api/v3/simple/price';

const COIN_IDS: Record<string, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  BNB: 'binancecoin',
  SOL: 'solana',
  TON: 'the-open-network',
  TRX: 'tron',
  DOT: 'polkadot',
  LINK: 'chainlink',
  AVAX: 'avalanche-2',
};

export interface CryptoPrice {
  symbol: string;
  price: number;
  change24h: number;
}

export async function fetchCryptoPrices(): Promise<CryptoPrice[]> {
  try {
    const ids = Object.values(COIN_IDS).join(',');
    const url = `${COINGECKO_API}?ids=${ids}&vs_currencies=usd&include_24hr_change=true`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; HNTelegramBot/1.0)',
      },
    });

    if (!response.ok) {
      console.warn(`CoinGecko API error: ${response.status}`);
      return [];
    }

    const data = await response.json() as Record<string, { usd: number; usd_24h_change?: number }>;
    const results: CryptoPrice[] = [];

    for (const [symbol, id] of Object.entries(COIN_IDS)) {
      if (data[id]?.usd !== undefined) {
        results.push({
          symbol,
          price: data[id].usd,
          change24h: data[id].usd_24h_change ?? 0,
        });
      }
    }

    return results;
  } catch (error) {
    console.warn('Error fetching crypto prices:', error);
    return [];
  }
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
