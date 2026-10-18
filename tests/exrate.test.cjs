const assert = require('node:assert/strict');
const { test, afterEach, mock } = require('node:test');
require('./register-typescript.cjs');
const { fetchExchangeRates, formatExchangeRates } = require('../src/exrate-api.ts');

afterEach(() => mock.restoreAll());

const rates = { PHP: 63.03, MYR: 4.08, TWD: 32.48, HKD: 7.85, CNY: 6.69, THB: 33.45, VND: 25894.00 };
const legacyCache = {
  rates: { ...rates, upstreamUpdatedAt: '2026-10-16 23:59 UTC', fetchedAt: '2026-10-17 04:29 UTC' },
  upstreamLastUpdatedAt: '2026-10-16T23:59:59Z',
};
function kvWith(value) {
  return { get: mock.fn(async () => value), put: mock.fn(async () => {}) };
}
function apiResponse(values = rates) {
  return Response.json({
    meta: { last_updated_at: '2026-10-16T23:59:59Z' },
    data: Object.fromEntries(Object.entries(values).map(([code, value]) => [code, { code, value }])),
  });
}

test('reproduces production nested cache and formats all seven rates without calling upstream', async () => {
  mock.method(globalThis, 'fetch', async () => assert.fail('Valid legacy cache should be reused'));
  const result = await fetchExchangeRates('test-key', kvWith(legacyCache));
  assert.deepEqual(result, { ...rates, updatedAt: '2026-10-16 23:59 UTC' });
  const text = formatExchangeRates(result);
  assert.match(text, /PHP: 63\.03/);
  assert.match(text, /VND: 25,894\.00/);
  assert.match(text, /Updated: 2026-10-16 23:59 UTC/);
  assert.doesNotMatch(text, /04:29|undefined|NaN/);
});

test('continues to accept the flat cache layout', async () => {
  const result = await fetchExchangeRates('test-key', kvWith({ ...rates, updatedAt: '2026-10-16 23:59 UTC' }));
  assert.equal(result.PHP, rates.PHP);
  assert.equal(result.updatedAt, '2026-10-16 23:59 UTC');
});

test('invalid cached data is ignored and replaced with validated upstream rates', async () => {
  mock.method(globalThis, 'fetch', async () => apiResponse());
  const kv = kvWith({ rates: { PHP: 63.03 } });
  const result = await fetchExchangeRates('test-key', kv);
  assert.equal(result.MYR, rates.MYR);
  assert.equal(kv.put.mock.callCount(), 1);
  assert.equal(kv.put.mock.calls[0].arguments[2].expirationTtl, 7200);
});

test('a KV read failure does not prevent querying the upstream API', async () => {
  mock.method(globalThis, 'fetch', async () => apiResponse());
  const kv = kvWith(null);
  kv.get = async () => { throw new Error('KV unavailable'); };
  const result = await fetchExchangeRates('test-key', kv);
  assert.equal(result.CNY, rates.CNY);
});

test('incomplete upstream rates are not cached or silently replaced with zero', async () => {
  mock.method(globalThis, 'fetch', async () => apiResponse({ PHP: 63.03 }));
  const kv = kvWith(null);
  await assert.rejects(fetchExchangeRates('test-key', kv), /missing valid exchange rates/);
  assert.equal(kv.put.mock.callCount(), 0);
});

test('fallback cache is normalized after an upstream failure', async () => {
  mock.method(globalThis, 'fetch', async () => new Response('unavailable', { status: 503 }));
  let reads = 0;
  const kv = kvWith(null);
  kv.get = async () => ++reads === 1 ? null : legacyCache;
  assert.equal((await fetchExchangeRates('test-key', kv)).VND, rates.VND);
});

test('invalid cache is never returned as a fallback', async () => {
  mock.method(globalThis, 'fetch', async () => new Response('unavailable', { status: 503 }));
  await assert.rejects(fetchExchangeRates('test-key', kvWith({ rates: { PHP: 63.03 } })), /503/);
});

test('formatter handles missing, non-numeric and invalid values without throwing', () => {
  const text = formatExchangeRates({ PHP: undefined, MYR: null, TWD: NaN, HKD: Infinity, CNY: 0, THB: -1, VND: '25894' });
  assert.equal((text.match(/暂无/g) || []).length, 7);
  assert.doesNotMatch(text, /NaN|Infinity|undefined|0\.00/);
});
