const YAHOO_CHART_API = 'https://query1.finance.yahoo.com/v8/finance/chart';

export interface MarketQuote {
  symbol: string;
  price: number | null;
  changePercent: number | null;
  updatedAt: number | null;
  previousClose?: number | null;
  error?: string;
}

interface ChartResponse {
  chart?: {
    error?: unknown;
    result?: Array<{
      meta?: {
        symbol?: unknown;
        currency?: unknown;
        regularMarketPrice?: unknown;
        regularMarketTime?: unknown;
        chartPreviousClose?: unknown;
      };
    }>;
  };
}

function positiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export async function fetchYahooQuote(symbol: string): Promise<MarketQuote> {
  const unavailable: MarketQuote = { symbol, price: null, changePercent: null, updatedAt: null };
  try {
    // range=1d makes chartPreviousClose the previous session's close.
    // Fetch every command anew; never read/write KV or reuse an old quote on error.
    const url = new URL(`${YAHOO_CHART_API}/${encodeURIComponent(symbol)}`);
    url.searchParams.set('interval', '1d');
    url.searchParams.set('range', '1d');
    // The stable Workers types omit cache, which is enabled by our compatibility flag.
    const options: RequestInit & { cache: 'no-store' } = {
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'spider-man-telegram-bot/1.0',
        'Cache-Control': 'no-cache, no-store',
      },
      signal: AbortSignal.timeout(8000),
    };
    const response = await fetch(url.toString(), options);
    if (!response.ok) {
      console.warn(`Market quote unavailable for ${symbol}: HTTP ${response.status}`);
      return { ...unavailable, error: `HTTP ${response.status}` };
    }

    const data = await response.json() as ChartResponse;
    const meta = data?.chart?.result?.[0]?.meta;
    if (data?.chart?.error || !meta || meta.symbol !== symbol || meta.currency !== 'USD'
      || !positiveNumber(meta.regularMarketPrice) || !positiveNumber(meta.regularMarketTime)
      || !Number.isSafeInteger(meta.regularMarketTime)
      || !Number.isFinite(new Date(meta.regularMarketTime * 1000).getTime())) {
      return { ...unavailable, error: '报价缺失或格式异常' };
    }

    const change = positiveNumber(meta.chartPreviousClose)
      ? (meta.regularMarketPrice / meta.chartPreviousClose - 1) * 100 : null;
    return {
      symbol,
      price: meta.regularMarketPrice,
      changePercent: change !== null && Number.isFinite(change) ? change : null,
      updatedAt: meta.regularMarketTime,
      previousClose: positiveNumber(meta.chartPreviousClose) ? meta.chartPreviousClose : null,
    };
  } catch (error) {
    console.warn(`Market quote request failed for ${symbol}`);
    return { ...unavailable, error: error instanceof Error && /timeout|abort/i.test(error.name) ? '请求超时' : '请求失败' };
  }
}
