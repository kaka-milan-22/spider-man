const assert = require('node:assert/strict');
const { test, afterEach, mock } = require('node:test');
require('./register-typescript.cjs');
const { lookupCoin, formatCoin } = require('../src/coin.ts');
const worker = require('../src/index.ts').default;

afterEach(() => mock.restoreAll());
const freshQuote = (id, extra = {}) => Response.json({ [id]: {
  usd: 0.0000001234, usd_24h_change: -2.5, last_updated_at: Math.floor(Date.now() / 1000), ...extra,
} });
const doge = { id: 'dogecoin', symbol: 'DOGE', name: 'Dogecoin', market_cap_rank: 8 };
function fastRetries() {
  mock.method(globalThis, 'setTimeout', fn => { queueMicrotask(fn); return 0; });
}

test('empty arguments default to BTC; known symbol and ID queries fetch only that coin without search', async () => {
  const requests = [];
  mock.method(globalThis, 'fetch', async (url, options) => {
    const u = new URL(url);
    requests.push(u);
    assert.equal(u.pathname, '/api/v3/simple/price');
    assert.equal(options.headers['x-cg-demo-api-key'], 'demo-key');
    assert.equal(options.cache, 'no-store');
    assert.ok(options.signal instanceof AbortSignal);
    assert.doesNotMatch(url, /demo-key/);
    return freshQuote(u.searchParams.get('ids'));
  });
  for (const input of ['', '   ', 'bTc', 'BITCOIN', '$BTC', 'paxg']) {
    const result = await lookupCoin(input, { coinGeckoApiKey: 'demo-key' });
    assert.equal(result.status, 'found');
    assert.equal(result.quote.symbol, input === 'paxg' ? 'PAXG' : 'BTC');
  }
  assert.equal(requests.length, 6);
  assert.equal(requests[5].searchParams.get('ids'), 'pax-gold');
});

test('discovers coins outside the watchlist and chooses the highest-ranked exact symbol match', async () => {
  mock.method(globalThis, 'fetch', async (url, options) => {
    const u = new URL(url);
    assert.equal(options.headers['x-cg-demo-api-key'], 'demo-key');
    if (u.pathname.endsWith('/search')) {
      assert.equal(u.searchParams.get('query'), 'doge');
      return Response.json({ coins: [
        { id: 'other-doge', symbol: 'DOGE', name: 'Other Doge', market_cap_rank: null },
        { id: 'doge-fake', symbol: 'DOGE', name: 'Fake Doge', market_cap_rank: 500 }, doge,
      ] });
    }
    assert.equal(u.searchParams.get('ids'), 'dogecoin');
    return freshQuote('dogecoin');
  });
  const result = await lookupCoin('DoGe', { coinGeckoApiKey: 'demo-key' });
  assert.equal(result.coin.id, 'dogecoin');
  const text = formatCoin(result);
  assert.match(text, /DOGE/);
  assert.match(text, /Dogecoin · <code>dogecoin<\/code>/);
  assert.match(text, /\$0\.0000001234 USD/);
  assert.match(text, /24h 涨跌幅：🔴 -2\.50%/);
  assert.match(text, /来源：CoinGecko/);
});

test('explicit CoinGecko ID takes priority over another coin with the same symbol', async () => {
  mock.method(globalThis, 'fetch', async url => new URL(url).pathname.endsWith('/search')
    ? Response.json({ coins: [doge, { id: 'specific-token', symbol: 'DOGE', name: 'Specific', market_cap_rank: 500 }] })
    : freshQuote('specific-token'));
  assert.equal((await lookupCoin('specific-token')).coin.id, 'specific-token');
});

test('exact full name searches work and fuzzy results never substitute another coin', async () => {
  mock.method(globalThis, 'fetch', async url => new URL(url).pathname.endsWith('/search')
    ? Response.json({ coins: [doge] }) : freshQuote('dogecoin'));
  assert.equal((await lookupCoin('Dogecoin')).status, 'found');
  assert.equal(formatCoin(await lookupCoin('Doge Something')), '找不到这个币');
});

test('empty search results return the requested not-found message without fetching prices', async () => {
  let calls = 0;
  mock.method(globalThis, 'fetch', async url => {
    calls++;
    assert.ok(new URL(url).pathname.endsWith('/search'));
    return Response.json({ coins: [] });
  });
  assert.equal(formatCoin(await lookupCoin('not-a-real-coin')), '找不到这个币');
  assert.equal(calls, 1);
});

test('search rate limits, malformed data and network errors are not reported as a missing coin', async () => {
  for (const response of [new Response('', { status: 429 }), Response.json({}), Response.json({ coins: [null] })]) {
    mock.method(globalThis, 'fetch', async () => response);
    assert.equal((await lookupCoin('doge')).status, 'unavailable');
  }
  mock.method(globalThis, 'fetch', async () => { throw new Error('private transport details'); });
  const text = formatCoin(await lookupCoin('doge'));
  assert.match(text, /行情服务暂时不可用/);
  assert.doesNotMatch(text, /private|找不到/);
});

test('known-coin primary failures use verified Coinbase pair', async () => {
  fastRetries();
  mock.method(globalThis, 'fetch', async url => {
    if (new URL(url).hostname === 'api.coingecko.com') return new Response('', { status: 503 });
    assert.equal(new URL(url).pathname, '/products/BTC-USD/stats');
    return Response.json({ open: '100', last: '110' });
  });
  const result = await lookupCoin();
  assert.equal(result.quote.source, 'Coinbase');
  assert.match(formatCoin(result), /🟢 \+10\.00%/);
});

test('unknown token mappings never fall back to an unrelated Coinbase coin sharing the ticker', async () => {
  fastRetries();
  mock.method(globalThis, 'fetch', async url => {
    const u = new URL(url);
    assert.equal(u.hostname, 'api.coingecko.com');
    if (u.pathname.endsWith('/search')) return Response.json({ coins: [doge] });
    return freshQuote('dogecoin', { last_updated_at: Math.floor(Date.now() / 1000) - 301 });
  });
  const result = await lookupCoin('doge');
  assert.equal(result.status, 'found');
  assert.equal(result.quote.price, null);
  assert.match(formatCoin(result), /暂无报价/);
  assert.doesNotMatch(formatCoin(result), /找不到这个币/);
});

test('invalid input is rejected without fetching or echoing injected HTML', async () => {
  mock.method(globalThis, 'fetch', async () => assert.fail('No requests allowed'));
  for (const input of ['<script>bad</script>', 'a'.repeat(81), 'btc&ids=eth']) {
    assert.equal(formatCoin(await lookupCoin(input)), '找不到这个币');
  }
});

test('formatting escapes upstream labels, preserves tiny prices and never invents a missing change', () => {
  const text = formatCoin({ status: 'found', coin: { id: 'token', name: '<b>Token</b>' },
    quote: { symbol: '<T>', price: 1.234e-15, change24h: null, source: 'CoinGecko' } });
  assert.match(text, /&lt;b&gt;Token&lt;\/b&gt;/);
  assert.match(text, /&lt;T&gt;/);
  assert.match(text, /1\.234.*E-15/);
  assert.match(text, /24h 涨跌幅：暂无/);
  assert.doesNotMatch(text, /\+0\.00|\$0\.00|NaN|Infinity/);
});

test('group webhook parses /coin@Bot parameters, defaults to BTC, and returns exact not-found text', async () => {
  const messages = [], requests = [], records = new Map();
  mock.method(globalThis, 'fetch', async (url, options) => {
    const u = new URL(url);
    if (u.hostname === 'api.telegram.org') {
      messages.push(JSON.parse(options.body));
      return Response.json({ ok: true });
    }
    requests.push(u);
    if (u.pathname.endsWith('/search')) return Response.json({ coins: [] });
    return freshQuote(u.searchParams.get('ids'));
  });
  const env = { TELEGRAM_BOT_TOKEN: 'test-token', TELEGRAM_CHAT_ID: '-1001234567890',
    TELEGRAM_WEBHOOK_SECRET: 'test-secret', HN_STORIES: {
      get: async key => records.has(key) ? JSON.parse(records.get(key)) : null,
      put: async (key, value) => records.set(key, value),
    } };
  for (const text of ['/coin', '/coin@ExampleBot paxg', '/coin missing-token']) {
    const pending = [];
    const response = await worker.fetch(new Request('https://worker.example/webhook', { method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': 'test-secret' },
      body: JSON.stringify({ update_id: messages.length + 1, message: {
        chat: { id: -1001234567890, type: 'supergroup' }, text,
        entities: [{ type: 'bot_command', offset: 0, length: text.split(' ')[0].length }],
      } }),
    }), env, { waitUntil: p => pending.push(p) });
    await Promise.all(pending);
    assert.equal(response.status, 200);
  }
  assert.match(messages[0].text, /BTC/);
  assert.match(messages[1].text, /PAXG/);
  assert.equal(messages[2].text, '找不到这个币');
  assert.ok(messages.slice(0, 2).every(m => m.parse_mode === 'HTML'));
  assert.ok(messages.every(m => m.chat_id === env.TELEGRAM_CHAT_ID));
  assert.equal(requests.length, 3);
  assert.ok([...records.keys()].every(key => /^status:v1:(coin|telegram)$/.test(key)));
});
