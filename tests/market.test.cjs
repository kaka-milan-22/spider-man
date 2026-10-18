const assert = require('node:assert/strict');
const { test, afterEach, mock } = require('node:test');
require('./register-typescript.cjs');
const { fetchMarketOverview, formatMarketOverview } = require('../src/market.ts');
afterEach(() => mock.restoreAll());

test('requests five indices fresh and preserves valid quotes when one source fails', async () => {
  const requests = [];
  mock.method(globalThis, 'fetch', async (url, options) => {
    const symbol = decodeURIComponent(new URL(url).pathname.split('/').pop());
    requests.push({ symbol, options });
    if (symbol === '^VIX') return new Response('rate limited', { status: 429 });
    return Response.json({ chart: { result: [{ meta: {
      symbol, currency: 'USD', regularMarketPrice: symbol === '^TNX' ? 5.098 : 100,
      chartPreviousClose: symbol === '^TNX' ? 5.089 : 95, regularMarketTime: 1792180800,
    } }] } });
  });
  const result = await fetchMarketOverview();
  await fetchMarketOverview();
  assert.equal(requests.length, 10);
  assert.deepEqual(result.map(q => q.symbol), ['^GSPC', '^IXIC', 'DX-Y.NYB', '^TNX', '^VIX']);
  assert.ok(requests.every(r => r.options.cache === 'no-store'));
  const text = formatMarketOverview(result);
  assert.match(text, /S&amp;P 500/);
  assert.match(text, /US 10Y<\/b>\n.*5.098%.*\+0.9 bp/);
  assert.match(text, /VIX<\/b>\n暂无报价/);
  assert.doesNotMatch(text, /\$/);
});

test('yield changes use basis points, not relative percent or multiplied yields', () => {
  const text = formatMarketOverview([{ symbol: '^TNX', price: 4.25, previousClose: 4.5, changePercent: -5.5555, updatedAt: 1792180800 }]);
  assert.match(text, /4.250%.*-25.0 bp/);
  assert.doesNotMatch(text, /42.50|5.56%/);
  assert.match(formatMarketOverview([{ symbol: '^TNX', price: 4.25, changePercent: null, updatedAt: 1792180800 }]), /变化暂无/);
});
