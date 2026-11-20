const assert = require('node:assert/strict');
const { test, afterEach, mock } = require('node:test');
require('./register-typescript.cjs');
const worker = require('../src/index.ts').default;
const { observe } = require('../src/monitoring.ts');
const { serveBrief, BRIEF_LATEST_KEY, getBrief } = require('../src/brief.ts');
const never = () => new Promise(() => {});
const secret = 'test-webhook-secret-with-at-least-32-characters';
afterEach(() => mock.restoreAll());

function accelerateDeadlines(includeSources = false) {
  const schedule = globalThis.setTimeout;
  mock.method(globalThis, 'setTimeout', (callback, ms, ...args) =>
    schedule(callback, ms === 1000 || (includeSources && ms === 14000) ? 1 : ms, ...args));
}

function sources() {
  for (const [file, name, result] of [
    ['crypto', 'fetchCryptoPrices', []], ['stocks', 'fetchStockPrices', []],
    ['crypto', 'fetchCryptoPrice', { symbol: 'BTC', price: 100, change24h: 1, source: 'CoinGecko' }],
    ['market', 'fetchMarketOverview', []], ['oil', 'fetchOilPrices', { international: [], philippines: null }],
    ['calendar', 'fetchCalendar', { events: [], sources: [], days: 7, fetchedAt: Date.now() }],
  ]) mock.method(require('../src/' + file + '.ts'), name, async () => result);
}

for (const stalled of ['get', 'put']) {
  test(`all commands terminate with a reply when KV ${stalled} stalls`, async () => {
    accelerateDeadlines();
    sources();
    const sent = [];
    const env = {
      TELEGRAM_BOT_TOKEN: 'test-token', TELEGRAM_CHAT_ID: '-100123', TELEGRAM_WEBHOOK_SECRET: secret,
      CURRENCY_API_KEY: 'test-currency-key', BRIEF_BASE_URL: 'https://worker.example',
      HN_STORIES: {
        get: stalled === 'get' ? never : async () => null,
        put: stalled === 'put' ? never : async () => {},
        list: never, delete: never,
      },
    };
    mock.method(globalThis, 'fetch', async (input, options) => {
      const url = String(input);
      if (url.endsWith('/sendMessage')) { sent.push(JSON.parse(options.body)); return Response.json({ ok: true }); }
      if (url.endsWith('/getChatAdministrators')) return Response.json({ ok: true, result: [{ status: 'creator', user: { id: 42 } }] });
      if (url.endsWith('/getWebhookInfo')) return Response.json({ ok: true, result: { url: 'https://worker.example/webhook', pending_update_count: 0 } });
      if (url.includes('currencyapi.com')) return Response.json({ data: Object.fromEntries(['PHP','MYR','TWD','HKD','CNY','THB','VND'].map(code => [code, { value: 2 }])) });
      if (url.endsWith('/topstories.json')) return Response.json([1]);
      if (url.endsWith('/item/1.json')) return Response.json({ id: 1, type: 'story', title: 'Story', url: 'https://example.com', score: 1, by: 'test', time: 1 });
      if (url === 'https://arstechnica.com/feed/') return new Response('<rss><item><title>Story</title><link>https://example.com</link></item></rss>');
      return new Response('Unavailable', { status: 503 });
    });
    for (const command of ['/btc', '/coin', '/stocks', '/market', '/calendar', '/oil', '/exrate', '/eth', '/top10hn', '/top10ars', '/brief', '/status', '/flushcache']) {
      const pending = [];
      const before = sent.length;
      const response = await worker.fetch(new Request('https://worker.example/webhook', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': secret },
        body: JSON.stringify({ update_id: before, message: {
          message_id: before, date: 0, from: { id: 42, is_bot: false }, chat: { id: -100123, type: 'supergroup' },
          text: command, entities: [{ type: 'bot_command', offset: 0, length: command.length }],
        } }),
      }), env, { waitUntil: promise => pending.push(promise) });
      assert.equal(response.status, 200);
      await Promise.all(pending);
      assert.equal(sent.length, before + 1, command + ' must reply exactly once');
      const message = sent.at(-1);
      if (command === '/flushcache') assert.match(message.text, /清理失败或超时/);
      else if (command === '/brief' && stalled === 'put') {
        assert.match(message.text, /执行失败/);
        assert.equal(message.reply_markup, undefined, 'never send an unpersisted report link');
      } else assert.doesNotMatch(message.text, /执行失败/, command + ' must preserve successful source results');
    }
  });
}

test('a stalled upstream operation is bounded independently of KV', async () => {
  accelerateDeadlines(true);
  await assert.rejects(observe({ get: async () => null, put: async () => {} }, 'crypto', never), /timed out/);
});

test('report storage outage returns 503 rather than claiming the report expired', async () => {
  accelerateDeadlines();
  const response = await serveBrief(new Request('https://worker.example/brief/11111111-1111-4111-8111-111111111111'), { HN_STORIES: { get: never } });
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('Retry-After'), '30');
});

test('latest pointer write failure preserves a persisted report', async () => {
  accelerateDeadlines(); sources();
  const writes = [];
  const report = await getBrief({ HN_STORIES: {
    get: async () => null,
    put: async key => { writes.push(key); if (key === BRIEF_LATEST_KEY) return never(); },
  } }, true);
  assert.ok(writes.includes('brief:v1:report:' + report.id));
  assert.ok(report.html.includes('每日市场简报'));
});
