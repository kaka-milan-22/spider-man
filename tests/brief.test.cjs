const assert = require('node:assert/strict');
const { test, afterEach, mock } = require('node:test');
require('./register-typescript.cjs');
const { getBrief, readBrief, renderBrief, BRIEF_TTL, BRIEF_RETENTION_TTL, BRIEF_LATEST_KEY, BRIEF_REPORT_PREFIX } = require('../src/brief.ts');
const { fetchExchangeRates } = require('../src/exrate-api.ts');
const worker = require('../src/index.ts').default;

afterEach(() => mock.restoreAll());

function setup() {
  const records = new Map();
  const writes = [];
  const requests = [];
  const messages = [];
  let revision = 1;
  const kv = {
    get: async (key, type) => {
      if (!records.has(key)) return null;
      return type === 'json' ? JSON.parse(records.get(key)) : records.get(key);
    },
    put: async (key, value, options) => { records.set(key, value); writes.push({ key, options }); },
  };
  const env = {
    HN_STORIES: kv, TELEGRAM_BOT_TOKEN: 'test-token', TELEGRAM_CHAT_ID: '-1001234567890',
    TELEGRAM_WEBHOOK_SECRET: 'test-secret', CURRENCY_API_KEY: 'test-currency-key',
    BRIEF_BASE_URL: 'https://worker.example',
  };
  mock.method(globalThis, 'fetch', async (url, options) => {
    const u = new URL(url);
    if (u.hostname === 'api.telegram.org') {
      messages.push(JSON.parse(options.body));
      return Response.json({ ok: true });
    }
    requests.push(url);
    if (u.hostname === 'api.coingecko.com') return Response.json(Object.fromEntries(
      ['bitcoin', 'ethereum', 'binancecoin', 'solana', 'the-open-network', 'polkadot', 'chainlink', 'avalanche-2', 'uniswap', 'aave', 'pax-gold']
        .map(id => [id, { usd: 100 + revision, usd_24h_change: revision, last_updated_at: Math.floor(Date.now() / 1000) }])));
    if (u.hostname === 'api.exchange.coinbase.com') return Response.json({ open: '100', last: String(100 + revision) });
    if (u.hostname === 'query1.finance.yahoo.com') return Response.json({ chart: { error: null, result: [{ meta: {
      symbol: decodeURIComponent(u.pathname.split('/').pop()), currency: 'USD', regularMarketPrice: 100 + revision,
      chartPreviousClose: 100, regularMarketTime: Math.floor(Date.now() / 1000),
    } }] } });
    if (u.hostname === 'api.currencyapi.com') return Response.json({
      meta: { last_updated_at: new Date().toISOString() },
      data: Object.fromEntries(['PHP', 'CNY', 'MYR', 'TWD', 'HKD', 'THB', 'VND'].map(c => [c, { value: revision }])),
    });
    // Failure of a calendar or fuel source must not prevent the rest of the brief.
    return new Response('', { status: 503 });
  });
  return { env, records, writes, requests, messages, next: () => revision++ };
}

test('manual generation caches one immutable report for 24 hours and subsequent requests do not fetch', async () => {
  const s = setup();
  const first = await getBrief(s.env);
  const calls = s.requests.length;
  s.next();
  const cached = await getBrief(s.env);
  assert.equal(cached.id, first.id);
  assert.equal(cached.generatedAt, first.generatedAt);
  assert.equal(cached.html, first.html);
  assert.equal(s.requests.length, calls);
  assert.ok(calls > 20);
  assert.ok(s.writes.filter(w => w.key.startsWith(BRIEF_REPORT_PREFIX)).every(w => w.options.expirationTtl === 7 * 86400));
  assert.ok(s.writes.filter(w => w.key === BRIEF_LATEST_KEY).every(w => w.options.expirationTtl === 86400));
  assert.equal(s.records.get(BRIEF_LATEST_KEY), first.id);
  assert.match(first.html, /部分|不完整/);
});

test('24 hours refreshes the latest cache while historical links remain readable for 7 days', async () => {
  const s = setup();
  let now = Date.now();
  mock.method(Date, 'now', () => now);
  const first = await getBrief(s.env);
  const calls = s.requests.length;
  now += BRIEF_TTL * 1000;
  assert.equal((await readBrief(s.env.HN_STORIES, first.id)).html, first.html);
  s.next();
  const fresh = await getBrief(s.env);
  assert.notEqual(fresh.id, first.id);
  assert.ok(s.requests.length > calls);
  assert.equal(fresh.generatedAt, now);
  const callsAfterRefresh = s.requests.length;
  const page = await worker.fetch(new Request(`https://worker.example/brief/${first.id}`), s.env, {});
  assert.equal(page.status, 200);
  assert.equal(await page.text(), first.html);
  assert.equal(s.requests.length, callsAfterRefresh);
  assert.equal(s.messages.length, 0);
  now = first.generatedAt + BRIEF_RETENTION_TTL * 1000 - 1;
  assert.ok(await readBrief(s.env.HN_STORIES, first.id));
  now++;
  assert.equal(await readBrief(s.env.HN_STORIES, first.id), null);
  assert.equal((await worker.fetch(new Request(`https://worker.example/brief/${first.id}`), s.env, {})).status, 410);
});

test('watchlist update ignores the old latest pointer and preserves its historical report', async () => {
  const s = setup();
  const old = await getBrief(s.env);
  s.records.set('brief:v1:latest', old.id);
  s.records.delete(BRIEF_LATEST_KEY);
  s.next();
  const fresh = await getBrief(s.env);
  assert.notEqual(fresh.id, old.id);
  assert.equal((await readBrief(s.env.HN_STORIES, old.id)).html, old.html);
  assert.match(fresh.html, /PAXG/);
  assert.match(fresh.html, />ANT</);
  assert.doesNotMatch(fresh.html, />GLD<|股票与黄金/);
  assert.doesNotMatch(fresh.summary, /部分数据缺失：[^\n]*Crypto/);
  assert.doesNotMatch(fresh.summary, /股票与黄金/);
});

test('scheduled execution forces fresh data, bypasses currency cache and updates manual cache', async () => {
  const s = setup();
  const old = await getBrief(s.env);
  const oldCalls = s.requests.length;
  assert.ok(s.records.has('exrate:latest'));
  s.next();
  const pending = [];
  await worker.scheduled({ cron: '0 3 * * *' }, s.env, { waitUntil: promise => pending.push(promise) });
  await Promise.all(pending);
  assert.ok(s.requests.length > oldCalls);
  assert.equal(s.requests.filter(url => new URL(url).hostname === 'api.currencyapi.com').length, 2);
  const fresh = await getBrief(s.env);
  assert.notEqual(fresh.id, old.id);
  assert.match(fresh.summary, /BTC：\$102\.00/);
  assert.equal((await readBrief(s.env.HN_STORIES, old.id)).html, old.html);
  assert.equal(s.messages.length, 1);
  assert.equal(s.messages[0].chat_id, s.env.TELEGRAM_CHAT_ID);
  assert.equal(s.messages[0].reply_markup.inline_keyboard[0][0].url, `https://worker.example/brief/${fresh.id}`);
});

test('a scheduled snapshot write times out after its 10-second budget and sends one failure notice', async () => {
  const s = setup();
  const put = s.env.HN_STORIES.put;
  let snapshotStarted = false;
  mock.method(s.env.HN_STORIES, 'put', (key, value, options) => {
    if (!key.startsWith(BRIEF_REPORT_PREFIX)) return put(key, value, options);
    snapshotStarted = true;
    return new Promise(() => {});
  });
  const schedule = globalThis.setTimeout;
  const deadlines = [];
  mock.method(globalThis, 'setTimeout', (callback, ms, ...args) => {
    if (ms === 10000) deadlines.push(ms);
    return schedule(callback, ms === 10000 ? 1 : ms, ...args);
  });
  const pending = [];
  await worker.scheduled({ cron: '0 3 * * *' }, s.env, { waitUntil: promise => pending.push(promise) });
  await assert.rejects(Promise.all(pending), { name: 'BriefSnapshotTimeoutError' });
  assert.equal(snapshotStarted, true);
  assert.deepEqual(deadlines, [10000]);
  assert.equal(s.records.has(BRIEF_LATEST_KEY), false);
  assert.equal(JSON.parse(s.records.get('status:v1:telegram')).ok, false);
  assert.equal(s.messages.length, 1);
  assert.equal(s.messages[0].chat_id, s.env.TELEGRAM_CHAT_ID);
  assert.match(s.messages[0].text, /财经日报发送失败[\s\S]*KV 超时（10 秒）/);
  assert.equal(s.messages[0].reply_markup, undefined);
});

test('10:30 HN cron sends news to the configured group without generating a market brief', async () => {
  const s = setup();
  delete s.env.TELEGRAM_WEBHOOK_SECRET;
  const stories = mock.method(require('../src/hn-api.ts'), 'getStoriesByRange', async (start, end) => {
    assert.equal(start, 1);
    assert.equal(end, 10);
    return [{ id: 123, title: 'Scheduled HN story', url: 'https://example.com/story',
      score: 100, by: 'author', time: 1700000000, descendants: 12 }];
  });
  const pending = [];
  await worker.scheduled({ cron: '30 2 * * *' }, s.env, { waitUntil: promise => pending.push(promise) });
  await Promise.all(pending);
  assert.equal(stories.mock.callCount(), 1);
  assert.equal(s.messages.length, 1);
  assert.equal(s.messages[0].chat_id, s.env.TELEGRAM_CHAT_ID);
  assert.match(s.messages[0].text, /Hacker News Daily Digest/);
  assert.match(s.messages[0].text, /Scheduled HN story/);
  assert.equal(s.requests.length, 0);
  assert.equal(s.records.has(BRIEF_LATEST_KEY), false);
});

test('unsupported cron fails without sending a message', async () => {
  const s = setup();
  await assert.rejects(worker.scheduled({ cron: '0 4 * * *' }, s.env, {
    waitUntil: () => assert.fail('Unexpected scheduled work'),
  }), /Unsupported scheduled cron/);
  assert.equal(s.messages.length, 0);
});

test('group /brief uses the same cached report and the button opens HTML without fetching sources', async () => {
  const s = setup();
  const report = await getBrief(s.env);
  const calls = s.requests.length;
  const pending = [];
  await worker.fetch(new Request('https://worker.example/webhook', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': 'test-secret' },
    body: JSON.stringify({ update_id: 1, message: {
      chat: { id: -1001234567890, type: 'supergroup' }, text: '/brief',
      entities: [{ type: 'bot_command', offset: 0, length: 6 }],
    } }),
  }), s.env, { waitUntil: promise => pending.push(promise) });
  await Promise.all(pending);
  const button = s.messages[0].reply_markup.inline_keyboard[0][0];
  assert.equal(button.text, '查看完整简报');
  const page = await worker.fetch(new Request(button.url), s.env, {});
  assert.equal(page.status, 200);
  assert.equal(await page.text(), report.html);
  assert.match(page.headers.get('Content-Type'), /text\/html/);
  assert.equal(page.headers.get('Cache-Control'), 'no-store');
  assert.equal(s.requests.length, calls);
  assert.equal((await worker.fetch(new Request(button.url, { method: 'HEAD' }), s.env, {})).status, 200);
  assert.equal((await worker.fetch(new Request(button.url, { method: 'POST' }), s.env, {})).status, 405);
});

test('missing and malformed report links return an expiry page without generating or sending anything', async () => {
  const s = setup();
  for (const path of ['/brief/latest', '/brief/00000000-0000-4000-8000-000000000000']) {
    const response = await worker.fetch(new Request('https://worker.example' + path), s.env, {});
    assert.equal(response.status, 410);
    assert.match(await response.text(), /发送 \/brief/);
  }
  assert.equal(s.requests.length, 0);
  assert.equal(s.messages.length, 0);
});

test('fresh currency requests never fall back to older cached rates', async () => {
  const s = setup();
  await getBrief(s.env);
  mock.method(globalThis, 'fetch', async () => new Response('', { status: 503 }));
  await assert.rejects(fetchExchangeRates('key', s.env.HN_STORIES, { forceRefresh: true }));
});

test('rendering preserves approved order, flags and dates, and escapes upstream text', () => {
  const html = renderBrief({ market: null, crypto: [{ symbol: '<script>bad</script>', price: null, change24h: null }],
    stocks: null, oil: null, exrate: { PHP: 1, CNY: 2, MYR: 3, TWD: 4, HKD: 5, THB: 6, VND: 7, updatedAt: '2026-11-13 23:30 UTC' },
    calendar: { days: 7, fetchedAt: Date.now(), sources: [{ source: 'BLS', ok: true }], events: [
      { title: '<img src=x onerror=bad()>', time: Date.now(), source: 'BLS' },
    ] },
  }, Date.parse('2026-11-14T03:00:00Z'));
  const order = [...html.matchAll(/<section id="([^"]+)">/g)].map(m => m[1]);
  assert.deepEqual(order, ['market', 'crypto', 'stocks', 'exrate', 'oil', 'calendar']);
  assert.match(html, /2026\.11\.14 · 11:00 UTC\+8/);
  assert.equal((html.match(/UTC\+8/g) || []).length, 1);
  assert.match(html, /源更新时间：2026-11-14 07:30/);
  assert.match(html, /🇹🇼 TWD/);
  assert.doesNotMatch(html, /新台币|示例日期|排版预览|<script>bad|<img src=x/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /&lt;img/);
});

test('overlapping manual cache misses in one isolate share generation', async () => {
  const s = setup();
  const reports = await Promise.all([getBrief(s.env), getBrief(s.env), getBrief(s.env)]);
  assert.equal(new Set(reports.map(r => r.id)).size, 1);
  assert.equal(s.requests.filter(url => new URL(url).hostname === 'api.currencyapi.com').length, 1);
});

test('all image assets are embedded and the only script is served by the same Worker', async () => {
  const s = setup();
  const report = await getBrief(s.env);
  const images = [...report.html.matchAll(/<img[^>]+src="([^"]+)"/g)].map(match => match[1]);
  assert.equal(images.length, 21);
  assert.ok(images.every(src => src.startsWith('data:image/')));
  assert.doesNotMatch(report.html, /<link[^>]+href="https?:|url\(https?:/);
  assert.match(report.html, /<script src="\/brief-nav\.js" defer>/);
  const script = await worker.fetch(new Request('https://worker.example/brief-nav.js'), s.env, {});
  assert.equal(script.status, 200);
  assert.match(await script.text(), /aria-current/);
});

test('production preserves both daily schedules and the brief is a public bot command', () => {
  const { readFileSync } = require('node:fs');
  for (const path of ['wrangler.toml', 'wrangler.toml.example']) {
    assert.match(readFileSync(path, 'utf8'), /crons\s*=\s*\["30 2 \* \* \*", "0 3 \* \* \*"\]/);
  }
  assert.match(readFileSync('commands.txt', 'utf8'), /^brief - /m);
});
