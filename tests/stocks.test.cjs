const assert = require('node:assert/strict');
const { test, afterEach, mock } = require('node:test');
require('./register-typescript.cjs');
const { STOCK_SYMBOLS, fetchStockPrices, formatStockPrices } = require('../src/stocks.ts');
const worker = require('../src/index.ts').default;

afterEach(() => mock.restoreAll());

const quoteTime = Date.parse('2026-10-16T20:00:00Z') / 1000;
function quoteResponse(symbol, overrides = {}) {
  return Response.json({ chart: { error: null, result: [{ meta: {
    symbol, currency: 'USD', regularMarketPrice: 110,
    chartPreviousClose: 100, regularMarketTime: quoteTime, ...overrides,
  } }] } });
}
function ticker(url) { return new URL(url).pathname.split('/').pop(); }

test('requests all ten USD instruments anew on every call with cache disabled', async () => {
  const requests = [];
  mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push({ url, options });
    return quoteResponse(ticker(url), { regularMarketPrice: requests.length > 10 ? 120 : 110 });
  });
  const first = await fetchStockPrices();
  const second = await fetchStockPrices();
  assert.deepEqual(first.map(quote => quote.symbol), [
    'AAPL', 'NVDA', 'TSLA', 'TSM', 'AMZN', 'MSFT', 'GLD', 'NET', 'META', 'GOOGL',
  ]);
  assert.equal(requests.length, 20);
  assert.equal(first[0].price, 110);
  assert.equal(second[0].price, 120);
  assert.ok(Math.abs(first[0].changePercent - 10) < 1e-9);
  for (const { url, options } of requests) {
    assert.equal(options.cache, 'no-store');
    assert.match(options.headers['Cache-Control'], /no-store/);
    assert.ok(options.signal instanceof AbortSignal);
    assert.equal(new URL(url).searchParams.get('range'), '1d');
  }
});

test('keeps successful quotes and marks individual HTTP, timeout and API failures unavailable', async () => {
  mock.method(globalThis, 'fetch', async url => {
    const symbol = ticker(url);
    if (symbol === 'NVDA') return new Response('rate limited', { status: 429 });
    if (symbol === 'TSLA') throw new DOMException('timeout', 'TimeoutError');
    if (symbol === 'META') return Response.json({ chart: { error: { code: 'Not Found' }, result: null } });
    return quoteResponse(symbol);
  });
  const prices = await fetchStockPrices();
  assert.equal(prices.length, 10);
  assert.deepEqual(prices.filter(quote => quote.price === null).map(quote => quote.symbol), ['NVDA', 'TSLA', 'META']);
  assert.equal(prices[0].price, 110);
  assert.match(formatStockPrices(prices), /NVDA\s*: 暂无报价/);
});

test('never substitutes earlier quotes when a later request fails', async () => {
  let requests = 0;
  mock.method(globalThis, 'fetch', async url => {
    if (++requests > STOCK_SYMBOLS.length) throw new Error('offline');
    return quoteResponse(ticker(url));
  });
  assert.equal((await fetchStockPrices())[0].price, 110);
  const failed = await fetchStockPrices();
  assert.ok(failed.every(quote => quote.price === null));
  assert.equal(formatStockPrices(failed), '❌ 获取股价失败，请稍后重试');
});

test('rejects wrong tickers/currencies, invalid prices and unusable timestamps', async () => {
  const invalidMeta = [
    { symbol: 'OTHER' }, { currency: 'EUR' }, { regularMarketPrice: null },
    { regularMarketPrice: '110' }, { regularMarketPrice: 0 }, { regularMarketPrice: -5 },
    { regularMarketTime: null }, { regularMarketTime: 0 },
    { regularMarketTime: 1e15 }, { regularMarketTime: '1792180800' },
  ];
  let index = 0;
  mock.method(globalThis, 'fetch', async url => quoteResponse(ticker(url), invalidMeta[index++]));
  assert.ok((await fetchStockPrices()).every(quote => quote.price === null));
});

test('missing previous close produces an unavailable change instead of a false zero percent', async () => {
  mock.method(globalThis, 'fetch', async url => quoteResponse(ticker(url), { chartPreviousClose: 0 }));
  const prices = await fetchStockPrices();
  assert.equal(prices[0].price, 110);
  assert.equal(prices[0].changePercent, null);
  assert.match(formatStockPrices(prices), /涨跌幅暂无/);
  assert.doesNotMatch(formatStockPrices(prices), /NaN|Infinity/);
});

test('uses BTC-style HTML price rows and formats quote time in UTC+8', () => {
  const text = formatStockPrices([
    { symbol: 'AAPL', price: 110, changePercent: 10, updatedAt: quoteTime },
    { symbol: 'GOOGL', price: 1234.5, changePercent: -2.5, updatedAt: quoteTime },
    { symbol: 'META', price: 100, changePercent: 0, updatedAt: quoteTime },
  ]);
  assert.match(text, /<b>📊 股票与黄金行情<\/b>/);
  assert.match(text, /<code>AAPL\s*: \$110\.00\s+🟢 \+10\.00%<\/code>/);
  assert.match(text, /<code>GOOGL: \$1,234\.50\s+🔴 -2\.50%<\/code>/);
  assert.match(text, /🟢 \+0\.00%/);
  assert.match(text, /报价：2026-10-17 04:00 UTC\+8 · 常规交易时段/);
  assert.equal(text.split('\n').filter(line => line.includes('报价：')).length, 1);
});

test('reports a time range when instruments have different quote timestamps', () => {
  const text = formatStockPrices([
    { symbol: 'AAPL', price: 100, changePercent: 0, updatedAt: quoteTime },
    { symbol: 'NET', price: 100, changePercent: 0, updatedAt: quoteTime - 86400 },
  ]);
  assert.match(text, /2026-10-16 04:00 至 2026-10-17 04:00 UTC\+8/);
});

test('a group member can run /stocks twice with only status metadata in KV', async () => {
  let quoteRequests = 0;
  const messages = [];
  mock.method(globalThis, 'fetch', async (url, options) => {
    if (new URL(url).hostname === 'api.telegram.org') {
      messages.push(JSON.parse(options.body));
      return Response.json({ ok: true });
    }
    quoteRequests++;
    return quoteResponse(ticker(url));
  });
  const kvCalls = [];
  const statusData = new Map();
  const forbiddenKV = () => { assert.fail('Stocks must not list or delete KV'); };
  const env = {
    TELEGRAM_BOT_TOKEN: 'test-token', TELEGRAM_CHAT_ID: '-1001234567890',
    TELEGRAM_WEBHOOK_SECRET: 'test-secret',
    HN_STORIES: {
      get: async key => { kvCalls.push(key); return statusData.has(key) ? JSON.parse(statusData.get(key)) : null; },
      put: async (key, value) => { kvCalls.push(key); statusData.set(key, value); },
      list: forbiddenKV, delete: forbiddenKV,
    },
  };
  for (let i = 0; i < 2; i++) {
    const pending = [];
    const response = await worker.fetch(new Request('https://worker.example/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': 'test-secret' },
      body: JSON.stringify({ update_id: i, message: {
        message_id: i, date: 0, from: { id: 99, is_bot: false, first_name: 'Member' },
        chat: { id: -1001234567890, type: 'supergroup' }, text: '/stocks@ExampleBot',
        entities: [{ type: 'bot_command', offset: 0, length: '/stocks@ExampleBot'.length }],
      } }),
    }), env, { waitUntil: promise => pending.push(promise) });
    await Promise.all(pending);
    assert.equal(response.status, 200);
  }
  assert.equal(quoteRequests, 20);
  assert.equal(messages.length, 2);
  assert.equal(messages[0].parse_mode, 'HTML');
  assert.equal(messages[0].chat_id, env.TELEGRAM_CHAT_ID);
  assert.match(messages[0].text, /GOOGL/);
  assert.ok(kvCalls.every(key => /^status:v1:(stocks|telegram)$/.test(key)));
  assert.equal(statusData.size, 2);
  assert.doesNotMatch([...statusData.values()].join(''), /regularMarketPrice|GOOGL|AAPL/);
});
