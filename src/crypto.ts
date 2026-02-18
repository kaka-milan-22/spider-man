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
}

export async function fetchCryptoPrices(): Promise<CryptoPrice[]> {
  try {
    const ids = Object.values(COIN_IDS).join(',');
    const url = `${COINGECKO_API}?ids=${ids}&vs_currencies=usd`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; HNTelegramBot/1.0)',
      },
    });

    if (!response.ok) {
      console.warn(`CoinGecko API error: ${response.status}`);
      return [];
    }

    const data = await response.json() as Record<string, { usd: number }>;
    const results: CryptoPrice[] = [];

    for (const [symbol, id] of Object.entries(COIN_IDS)) {
      if (data[id]?.usd !== undefined) {
        results.push({ symbol, price: data[id].usd });
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
    return '📊 *加密货币行情*\n\n❌ 获取价格失败，请稍后重试';
  }

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
