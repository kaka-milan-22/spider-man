// API client for currencyapi.com to fetch USD exchange rates to 7 Asian currencies
// - PHP, MYR, TWD, HKD, CNY, THB, VND

const CACHE_KEY = 'exrate:latest';
const CACHE_TTL = 3600; // 60 minutes

export interface ExchangeRates {
  PHP: number;
  MYR: number;
  TWD: number;
  HKD: number;
  CNY: number;
  THB: number;
  VND: number;
  updatedAt?: string; // UTC timestamp in format: YYYY-MM-DD HH:mm UTC
}

interface CurrencyApiRateItem {
  code: string;
  value: number;
}

interface CurrencyApiData {
  PHP: CurrencyApiRateItem;
  MYR: CurrencyApiRateItem;
  TWD: CurrencyApiRateItem;
  HKD: CurrencyApiRateItem;
  CNY: CurrencyApiRateItem;
  THB: CurrencyApiRateItem;
  VND: CurrencyApiRateItem;
}

interface CurrencyApiMeta {
  last_updated_at: string;
}

interface CurrencyApiResponse {
  meta?: CurrencyApiMeta;
  data: CurrencyApiData;
}

// Helper to format UTC date string as YYYY-MM-DD HH:mm UTC
function formatUpdatedAt(iso?: string): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const min = String(d.getUTCMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${min} UTC`;
}

// Fetch exchange rates from Currency API with KV caching
export async function fetchExchangeRates(apiKey: string, kv: KVNamespace): Promise<ExchangeRates> {
  try {
    const cached = await kv.get(CACHE_KEY, 'json');
    if (cached) {
      console.log('Cache hit for exchange rates');
      return cached as ExchangeRates;
    }

    console.log('Fetching exchange rates from Currency API...');
    const url = new URL('https://api.currencyapi.com/v3/latest');
    url.searchParams.set('base_currency', 'USD');
    url.searchParams.set('currencies', 'PHP,MYR,TWD,HKD,CNY,THB,VND');

    const resp = await fetch(url.toString(), {
      headers: {
        // Currency API expects the API key in the 'apikey' header
        apikey: apiKey,
        // Some environments may require a user agent; keep minimal
        'User-Agent': 'HNTelegramBot/1.0',
      },
    });

    if (!resp.ok) {
      throw new Error(`Currency API request failed: ${resp.status} ${resp.statusText}`);
    }

    const data = (await resp.json()) as CurrencyApiResponse;
    const by = data.data;
    const updatedAt = formatUpdatedAt(data.meta?.last_updated_at);

    const rates: ExchangeRates = {
      PHP: by.PHP?.value ?? 0,
      MYR: by.MYR?.value ?? 0,
      TWD: by.TWD?.value ?? 0,
      HKD: by.HKD?.value ?? 0,
      CNY: by.CNY?.value ?? 0,
      THB: by.THB?.value ?? 0,
      VND: by.VND?.value ?? 0,
      updatedAt,
    };

    await kv.put(CACHE_KEY, JSON.stringify(rates), {
      expirationTtl: CACHE_TTL,
    });
    console.log('Cached exchange rates');

    return rates;
  } catch (error) {
    console.error('Error fetching exchange rates:', error);
    
    try {
      const cached = await kv.get(CACHE_KEY, 'json');
      if (cached) {
        console.log('Returning cached data after fetch error');
        return cached as ExchangeRates;
      }
    } catch (cacheError) {
      console.warn('Failed to read fallback cache:', cacheError);
    }
    
    throw new Error(`Failed to fetch exchange rates: ${String(error)}`);
  }
}

// Format the exchange rates into a human-friendly string
export function formatExchangeRates(rates: ExchangeRates): string {
  const formatValue = (n: number) => {
    // Use thousand separators for large values, otherwise 2 decimals
    if (n >= 1000) {
      return n.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    }
    return n.toFixed(2);
  };

  const lines = [
    `🇵🇭 PHP: ${formatValue(rates.PHP)}`,
    `🇲🇾 MYR: ${formatValue(rates.MYR)}`,
    `🇹🇼 TWD: ${formatValue(rates.TWD)}`,
    `🇭🇰 HKD: ${formatValue(rates.HKD)}`,
    `🇨🇳 CNY: ${formatValue(rates.CNY)}`,
    `🇹🇭 THB: ${formatValue(rates.THB)}`,
    `🇻🇳 VND: ${formatValue(rates.VND)}`,
  ];

  let result = '🇺🇸 *Exchange Rates* (1 USD)\n\n' + lines.join('\n');

  if (rates.updatedAt) {
    result += `\n\nUpdated: ${rates.updatedAt}`;
  }

  return result;
}
