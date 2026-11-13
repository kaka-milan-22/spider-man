import type { Env } from './types';
import { fetchCryptoPrices } from './crypto';

// Read-only live check; requires the short-lived maintenance credential.
// Returns metadata only, never keys, request headers or raw provider responses.
export async function probeCryptoSources(env: Env) {
  const quotes = await fetchCryptoPrices({ coinGeckoApiKey: env.COINGECKO_API_KEY });
  return {
    available: quotes.filter(q => q.price !== null).length,
    total: quotes.length,
    primaryKeyConfigured: Boolean(env.COINGECKO_API_KEY?.trim()),
    quotes: quotes.map(q => ({ symbol: q.symbol, available: q.price !== null,
      source: q.source || null, ...(q.error ? { error: q.error } : {}) })),
  };
}
