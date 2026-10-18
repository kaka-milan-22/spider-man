import { fetchYahooQuote, type MarketQuote } from './yahoo-finance';
import { displayTime, escapeHtml } from './display';

export const MARKET_INSTRUMENTS = [
  { symbol: '^GSPC', label: 'S&P 500' },
  { symbol: '^IXIC', label: 'Nasdaq' },
  { symbol: 'DX-Y.NYB', label: 'DXY' },
  { symbol: '^TNX', label: 'US 10Y' },
  { symbol: '^VIX', label: 'VIX' },
] as const;

export async function fetchMarketOverview(): Promise<MarketQuote[]> {
  return Promise.all(MARKET_INSTRUMENTS.map(item => fetchYahooQuote(item.symbol)));
}

export function formatMarketOverview(quotes: MarketQuote[]): string {
  const lines = ['<b>🌐 市场概览</b>', '报价时间：UTC+8'];
  for (const { symbol, label } of MARKET_INSTRUMENTS) {
    lines.push('', `<b>${escapeHtml(label)}</b>`);
    const quote = quotes.find(item => item.symbol === symbol);
    if (!quote || quote.price === null) {
      lines.push('暂无报价');
      continue;
    }
    const yieldQuote = symbol === '^TNX';
    const value = quote.price.toLocaleString('en-US', {
      minimumFractionDigits: yieldQuote ? 3 : 2, maximumFractionDigits: yieldQuote ? 3 : 2,
    }) + (yieldQuote ? '%' : '');
    // Yahoo ^TNX is already in percent. A 0.01 percentage-point move is 1 bp.
    const change = yieldQuote
      ? quote.previousClose == null ? null : (quote.price - quote.previousClose) * 100
      : quote.changePercent;
    const changeText = change === null ? '变化暂无'
      : `${change >= 0 ? '🟢 +' : '🔴 '}${change.toFixed(yieldQuote ? 1 : 2)}${yieldQuote ? ' bp' : '%'}`;
    lines.push(`<code>${value}</code>  ${changeText}`);
    if (quote.updatedAt !== null) lines.push(displayTime(quote.updatedAt * 1000));
  }
  lines.push('', 'US 10Y 为收益率；其余为指数点位',
    '1 bp = 0.01 个百分点',
    '变化相对前收盘 · 报价可能延迟',
    '来源：Yahoo Finance');
  return lines.join('\n');
}
