const COINCAP_API = 'https://api.coincap.io/v2/assets';

const COIN_IDS: Record<string, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  BNB: 'binance-coin',
  SOL: 'solana',
  TON: 'toncoin',
  TRX: 'tron',
  DOT: 'polkadot',
  LINK: 'chainlink',
  AVAX: 'avalanche',
};

export interface CryptoPrice {
  symbol: string;
  price: number;
  change24h: number;
}

export async function fetchCryptoPrices(): Promise<CryptoPrice[]> {
  try {
    const ids = Object.values(COIN_IDS).join(',');
    const url = `${COINCAP_API}?ids=${ids}`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; HNTelegramBot/1.0)',
      },
    });

    if (!response.ok) {
      console.warn(`CoinCap API error: ${response.status}`);
      return [];
    }

    const json = await response.json() as { data: Array<{ id: string; priceUsd: string; changePercent24Hr: string }> };
    const results: CryptoPrice[] = [];

    const idToSymbol: Record<string, string> = {};
    for (const [symbol, id] of Object.entries(COIN_IDS)) {
      idToSymbol[id] = symbol;
    }

    for (const coin of json.data) {
      const symbol = idToSymbol[coin.id];
      if (symbol) {
        results.push({
          symbol,
          price: parseFloat(coin.priceUsd),
          change24h: parseFloat(coin.changePercent24Hr),
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
    return '📊 *加密货币行情*\n\n❌ 获取价格失败，请稍后重试';
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

  return `📊 *加密货币行情*\n\n\`\`\`\n${lines.join('\n')}\n\`\`\``;
}
