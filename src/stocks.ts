import { fetchYahooQuote, type MarketQuote } from './yahoo-finance';

export type StockPrice = MarketQuote;

// All instruments are USD-listed. AWS uses Amazon; gold uses the GLD ETF.
export const STOCK_SYMBOLS = [
  'AAPL', 'NVDA', 'TSLA', 'TSM', 'AMZN', 'MSFT', 'GLD', 'NET', 'META', 'GOOGL',
] as const;

export async function fetchStockPrices(): Promise<StockPrice[]> {
  return Promise.all(STOCK_SYMBOLS.map(symbol => fetchYahooQuote(symbol)));
}

export function formatStockPrices(prices: StockPrice[]): string {
  if (!prices.some(price => price.price !== null)) {
    return '❌ 获取股价失败，请稍后重试';
  }

  const lines = prices.map(quote => {
    if (quote.price === null) return `<code>${quote.symbol.padEnd(5)}: 暂无报价</code>`;
    const priceStr = quote.price.toLocaleString('en-US', {
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    });
    const changeStr = quote.changePercent === null ? '涨跌幅暂无'
      : quote.changePercent >= 0 ? `🟢 +${quote.changePercent.toFixed(2)}%`
      : `🔴 ${quote.changePercent.toFixed(2)}%`;
    return `<code>${quote.symbol.padEnd(5)}: $${priceStr.padEnd(10)} ${changeStr}</code>`;
  });

  const timestamps = prices.flatMap(quote => quote.updatedAt === null ? [] : [quote.updatedAt]);
  const formatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  const first = formatter.format(new Date(Math.min(...timestamps) * 1000));
  const last = formatter.format(new Date(Math.max(...timestamps) * 1000));
  const quoteTime = first === last ? first : `${first} 至 ${last}`;

  return `<b>📊 股票与黄金行情</b>\n\n${lines.join('\n')}\n\n`
    + `报价：${quoteTime} UTC+8 · 常规交易时段`;
}
