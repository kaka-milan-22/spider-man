// API client for currencyapi.com to fetch USD exchange rates to 7 Asian currencies
// - PHP, MYR, TWD, HKD, CNY, THB, VND

const CACHE_KEY = 'exrate:latest';
const CACHE_TTL = 7200; // 120 minutes
const CURRENCIES = ['PHP', 'MYR', 'TWD', 'HKD', 'CNY', 'THB', 'VND'] as const;

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidRate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

// Older deployments stored an envelope: { rates: {...}, upstreamLastUpdatedAt }.
// Validate both layouts instead of treating arbitrary cached JSON as ExchangeRates.
function normalizeRates(value: unknown): ExchangeRates | null {
  if (!isRecord(value)) return null;
  const rates = isRecord(value.rates) ? value.rates : value;
  if (!CURRENCIES.every(currency => isValidRate(rates[currency]))) return null;
  const timestamp = [value.upstreamLastUpdatedAt, rates.updatedAt, rates.upstreamUpdatedAt]
    .find(candidate => typeof candidate === 'string');
  return {
    ...Object.fromEntries(CURRENCIES.map(currency => [currency, rates[currency]])) as unknown as ExchangeRates,
    updatedAt: typeof timestamp === 'string' ? formatUpdatedAt(timestamp) : undefined,
  };
}

async function readCachedRates(kv: KVNamespace): Promise<ExchangeRates | null> {
  try {
    const cached = await kv.get(CACHE_KEY, 'json');
    const rates = normalizeRates(cached);
    if (cached && !rates) console.warn('Ignoring invalid exchange-rate cache');
    return rates;
  } catch {
    console.warn('Unable to read exchange-rate cache; requesting upstream data');
    return null;
  }
}

// Fetch exchange rates from Currency API with KV caching
export async function fetchExchangeRates(apiKey: string, kv: KVNamespace): Promise<ExchangeRates> {
  try {
    const cached = await readCachedRates(kv);
    if (cached) {
      console.log('Cache hit for exchange rates');
      return cached;
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
    const rates = normalizeRates({
      ...Object.fromEntries(CURRENCIES.map(currency => [currency, data?.data?.[currency]?.value])),
      updatedAt: formatUpdatedAt(data?.meta?.last_updated_at),
    });
    if (!rates) throw new Error('Currency API response is missing valid exchange rates');

    await kv.put(CACHE_KEY, JSON.stringify(rates), {
      expirationTtl: CACHE_TTL,
    });
    console.log('Cached exchange rates');

    return rates;
  } catch (error) {
    console.error('Error fetching exchange rates:', error);
    
    const cached = await readCachedRates(kv);
    if (cached) {
      console.log('Returning validated cached data after fetch error');
      return cached;
    }
    
    throw new Error(`Failed to fetch exchange rates: ${String(error)}`);
  }
}

// Format the exchange rates into a human-friendly string
export function formatExchangeRates(rates: ExchangeRates): string {
  const formatValue = (n: unknown) => {
    if (!isValidRate(n)) return '暂无';
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
