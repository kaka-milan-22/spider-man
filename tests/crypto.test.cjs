const assert = require('node:assert/strict');
const { test, afterEach, mock } = require('node:test');
require('./register-typescript.cjs');
const { fetchCryptoPrices, formatCryptoPrices } = require('../src/crypto.ts');
const worker = require('../src/index.ts').default;
const coins = { BTC: 'bitcoin', ETH: 'ethereum', BNB: 'binancecoin', SOL: 'solana', TON: 'the-open-network', DOT: 'polkadot', LINK: 'chainlink', AVAX: 'avalanche-2', UNI: 'uniswap', AAVE: 'aave', PAXG: 'pax-gold' };
afterEach(() => mock.restoreAll());
function fastRetries() {
  const schedule = globalThis.setTimeout;
  mock.method(globalThis, 'setTimeout', (callback, ms, ...args) => {
    if (ms >= 1000) return schedule(callback, ms, ...args);
    queueMicrotask(callback); return 0;
  });
  mock.method(console, 'warn', () => {});
}
function gecko(overrides = {}) {
  return Response.json(Object.fromEntries(Object.values(coins).map(id => [id, {
    usd: 110, usd_24h_change: 10, last_updated_at: Math.floor(Date.now() / 1000), ...overrides[id],
  }])));
}
function isGecko(url) { return new URL(url).hostname === 'api.coingecko.com'; }
function pair(url) { return new URL(url).pathname.split('/')[2]; }
function success() { return Response.json({ open: '100', last: '110' }); }

test('queries all eleven USD coins in one authenticated batch and makes no Coinbase requests on success', async () => {
  const requests = [];
  mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push({ url, options });
    assert.ok(isGecko(url));
    assert.equal(options.headers['x-cg-demo-api-key'], 'test-key');
    assert.equal(options.cache, 'no-store');
    assert.ok(options.signal instanceof AbortSignal);
    assert.equal(new URL(url).searchParams.get('vs_currencies'), 'usd');
    assert.equal(new URL(url).searchParams.get('include_last_updated_at'), 'true');
    assert.doesNotMatch(url, /test-key/);
    return gecko();
  });
  const prices = await fetchCryptoPrices({ coinGeckoApiKey: 'test-key' });
  assert.equal(requests.length, 1);
  assert.equal(new URL(requests[0].url).searchParams.get('ids').split(',').length, 11);
  assert.deepEqual(prices.map(p => p.symbol), Object.keys(coins));
  assert.ok(prices.every(p => p.source === 'CoinGecko' && p.price === 110 && p.change24h === 10));
});

test('only retries missing or stale coins and only falls back for unresolved pairs', async () => {
  fastRetries();
  const requests = [];
  mock.method(globalThis, 'fetch', async url => {
    requests.push(url);
    if (isGecko(url)) return gecko({ binancecoin: { usd: null }, 'avalanche-2': { last_updated_at: Math.floor(Date.now() / 1000) - 301 } });
    return pair(url) === 'BNB-USD' ? new Response('', { status: 404 }) : success();
  });
  const prices = await fetchCryptoPrices();
  assert.equal(requests.length, 4);
  assert.deepEqual(new URL(requests[1]).searchParams.get('ids').split(','), ['binancecoin', 'avalanche-2']);
  assert.deepEqual(requests.slice(2).map(pair), ['BNB-USD', 'AVAX-USD']);
  assert.equal(prices[2].price, null);
  assert.equal(prices[7].source, 'Coinbase');
  assert.match(formatCryptoPrices(prices), /BNB\s*: 暂无报价/);
  assert.match(formatCryptoPrices(prices), /<i>Coinbase<\/i>/);
  assert.match(formatCryptoPrices(prices), /BTC\s*: \$110\.00\s+🟢 \+10\.00%/);
});

test('two primary failures leave only one fallback attempt and never exceed three attempts per coin', async () => {
  fastRetries();
  let batches = 0;
  const calls = new Map();
  mock.method(globalThis, 'fetch', async url => {
    if (isGecko(url)) { batches++; return new Response('', { status: 503 }); }
    const symbol = pair(url);
    calls.set(symbol, (calls.get(symbol) || 0) + 1);
    throw new DOMException('timeout', 'TimeoutError');
  });
  const prices = await fetchCryptoPrices();
  assert.equal(batches, 2);
  assert.equal(calls.size, 11);
  assert.ok([...calls.values()].every(count => count === 1));
  assert.equal((formatCryptoPrices(prices).match(/暂无报价/g) || []).length, 11);
  assert.doesNotMatch(formatCryptoPrices(prices), /NaN|Infinity/);
});

test('PAXG retries pax-gold then falls back to PAXG-USD without refetching other coins', async () => {
  fastRetries();
  const requests = [];
  mock.method(globalThis, 'fetch', async url => {
    requests.push(url);
    return isGecko(url) ? gecko({ 'pax-gold': { usd: null } }) : success();
  });
  const prices = await fetchCryptoPrices();
  assert.equal(requests.length, 3);
  assert.equal(new URL(requests[1]).searchParams.get('ids'), 'pax-gold');
  assert.equal(pair(requests[2]), 'PAXG-USD');
  assert.equal(prices.find(q => q.symbol === 'PAXG').source, 'Coinbase');
  assert.match(formatCryptoPrices(prices), /PAXG: \$110\.00\s+🟢 \+10\.00%/);
});

test('non-retryable primary errors allow at most two Coinbase attempts and cap fallback concurrency at four', async () => {
  fastRetries();
  const calls = new Map();
  let active = 0, peak = 0, batches = 0;
  mock.method(globalThis, 'fetch', async url => {
    if (isGecko(url)) { batches++; return new Response('', { status: 403 }); }
    active++; peak = Math.max(peak, active);
    await new Promise(resolve => queueMicrotask(resolve));
    active--;
    const symbol = pair(url), count = (calls.get(symbol) || 0) + 1;
    calls.set(symbol, count);
    return count < 2 ? new Response('', { status: 429 }) : success();
  });
  const prices = await fetchCryptoPrices();
  assert.equal(batches, 1);
  assert.ok(peak <= 4);
  assert.ok([...calls.values()].every(count => count === 2));
  assert.ok(prices.every(p => p.source === 'Coinbase' && p.price === 110));
});

test('does not retry a rate-limited source before a long Retry-After expires', async () => {
  fastRetries();
  let primary = 0, secondary = 0;
  mock.method(globalThis, 'fetch', async url => {
    if (isGecko(url)) { primary++; return new Response('', { status: 429, headers: { 'Retry-After': '60' } }); }
    secondary++; return new Response('', { status: 429, headers: { 'Retry-After': '60' } });
  });
  assert.ok((await fetchCryptoPrices()).every(p => p.price === null));
  assert.equal(primary, 1);
  assert.equal(secondary, 11);
});

test('preserves valid prices when 24h change is missing and rejects invalid or future/stale primary prices', async () => {
  fastRetries();
  mock.method(globalThis, 'fetch', async url => isGecko(url) ? gecko({
    bitcoin: { usd_24h_change: null }, ethereum: { usd: '110' },
    binancecoin: { last_updated_at: Math.floor(Date.now() / 1000) + 120 },
  }) : success());
  const prices = await fetchCryptoPrices();
  assert.equal(prices[0].source, 'CoinGecko');
  assert.equal(prices[0].price, 110);
  assert.equal(prices[0].change24h, null);
  assert.equal(prices[1].source, 'Coinbase');
  assert.equal(prices[2].source, 'Coinbase');
  assert.match(formatCryptoPrices(prices), /涨跌幅暂无/);
});

test('never substitutes an earlier successful quote when both providers subsequently fail', async () => {
  fastRetries();
  let offline = false;
  mock.method(globalThis, 'fetch', async url => {
    if (offline) throw new Error('offline');
    return isGecko(url) ? gecko() : success();
  });
  assert.equal((await fetchCryptoPrices())[0].price, 110);
  offline = true;
  assert.ok((await fetchCryptoPrices()).every(p => p.price === null));
});

test('the webhook forwards the Demo key and records actual partial availability', async () => {
  fastRetries();
  const records = new Map(), messages = [];
  mock.method(globalThis, 'fetch', async (url, options) => {
    if (new URL(url).hostname === 'api.telegram.org') {
      messages.push(JSON.parse(options.body));return Response.json({ ok: true });
    }
    if (isGecko(url)) { assert.equal(options.headers['x-cg-demo-api-key'], 'test-key');return gecko({ binancecoin: { usd: null } }); }
    return new Response('', { status: 404 });
  });
  const env = { TELEGRAM_BOT_TOKEN: 'test-token', TELEGRAM_CHAT_ID: '-1001234567890',
    TELEGRAM_WEBHOOK_SECRET: 'test-secret', COINGECKO_API_KEY: 'test-key',
    HN_STORIES: { get: async key => records.has(key) ? JSON.parse(records.get(key)) : null,
      put: async (key, value) => records.set(key, value) },
  };
  const pending = [];
  await worker.fetch(new Request('https://worker.example/webhook', { method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': 'test-secret' },
    body: JSON.stringify({ update_id: 1, message: { chat: { id: -1001234567890, type: 'supergroup' },
      text: '/btc', entities: [{ type: 'bot_command', offset: 0, length: 4 }] } }),
  }), env, { waitUntil: promise => pending.push(promise) });
  await Promise.all(pending);
  assert.match(messages[0].text, /BNB\s*: 暂无报价/);
  const record = JSON.parse(records.get('status:v1:crypto'));
  assert.equal(record.ok, false);
  assert.match(record.detail, /10\/11/);
  assert.doesNotMatch(JSON.stringify([...records.values()]), /test-key/);
});
