const assert = require('node:assert/strict');
const { test, afterEach, mock } = require('node:test');
require('./register-typescript.cjs');
const { fetchOilPrices, parsePhilippineFuelPrices, formatOilPrices, PH_FUEL_SOURCE } = require('../src/oil.ts');
const worker = require('../src/index.ts').default;

afterEach(() => mock.restoreAll());
const now = Date.parse('2026-10-18T08:00:00Z');
const average = 'As of October 13, 2026, the Metro Manila average diesel price is ₱91.65 per liter and unleaded is ₱92.90 per liter, based on station-weighted averages across 964 stations in 17 cities tracked by GasWatch PH for the week of Oct 13 – 19, 2026.';
function fuelPage(answer = average) {
  return `<script type="application/ld+json">${JSON.stringify({ '@type': 'FAQPage', mainEntity: [
    { name: 'What is the cheapest diesel in Metro Manila today?', acceptedAnswer: { text: 'Flying V at ₱88.18 per liter' } },
    { name: 'What is the average fuel price in Metro Manila this week?', acceptedAnswer: { text: answer } },
  ] })}</script>`;
}
function quoteResponse(url) {
  return Response.json({ chart: { error: null, result: [{ meta: {
    symbol: decodeURIComponent(new URL(url).pathname.split('/').pop()), currency: 'USD',
    regularMarketPrice: 110, chartPreviousClose: 100,
    regularMarketTime: Date.parse('2026-10-16T20:00:00Z') / 1000,
  } }] } });
}

test('reads published Metro Manila averages and date, not cheapest prices or request time', () => {
  assert.deepEqual(parsePhilippineFuelPrices(fuelPage(), now), {
    diesel: 91.65, gasoline: 92.90, publishedAt: '2026-10-13',
  });
});

test('rejects missing, invalid, mislabelled and future Philippine data without guessing', () => {
  for (const text of [
    average.replace('₱91.65', '₱0'), average.replace('₱91.65', '₱NaN'),
    average.replace('₱92.90', '$92.90'), average.replace('Metro Manila', 'Cavite'),
    average.replace('October 13', 'October 32'), average.replace('October 13', 'October 19'),
    average.replace('October 13', 'February 30'), average.replace('October', 'Unknown'),
    average.replace('average diesel', 'cheapest diesel'), '<script>alert(1)</script>',
  ]) assert.equal(parsePhilippineFuelPrices(fuelPage(text), now), null);
  assert.equal(parsePhilippineFuelPrices('<html>Maintenance</html>', now), null);
  assert.equal(parsePhilippineFuelPrices('<script type="application/ld+json">broken</script>', now), null);
});

test('publication date uses the Manila calendar and unrelated broken JSON-LD is ignored', () => {
  const html = '<script type="application/ld+json">broken</script>' + fuelPage(average.replace('October 13', 'October 19'));
  assert.equal(parsePhilippineFuelPrices(html, Date.parse('2026-10-18T16:00:00Z')).publishedAt, '2026-10-19');
});

test('all three sources are fetched anew with no-store; failed data never reuses old quotes', async () => {
  const requests = [];
  mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push({ url, options });
    if (requests.length > 3) throw new DOMException('timeout', 'TimeoutError');
    return url === PH_FUEL_SOURCE ? new Response(fuelPage()) : quoteResponse(url);
  });
  const first = await fetchOilPrices();
  assert.deepEqual(first.international.map(q => q.symbol), ['BZ=F', 'CL=F']);
  assert.ok(first.international.every(q => q.price === 110));
  assert.equal(first.philippines.diesel, 91.65);
  const second = await fetchOilPrices();
  assert.ok(second.international.every(q => q.price === null));
  assert.equal(second.philippines, null);
  assert.equal(requests.length, 6);
  for (const { options } of requests) {
    assert.equal(options.cache, 'no-store');
    assert.match(options.headers['Cache-Control'], /no-store/);
    assert.ok(options.signal instanceof AbortSignal);
  }
});

test('Philippine source failures preserve international quotes and vice versa', async () => {
  mock.method(globalThis, 'fetch', async url => url === PH_FUEL_SOURCE
    ? new Response('unavailable', { status: 503 }) : quoteResponse(url));
  let prices = await fetchOilPrices();
  assert.equal(prices.international[0].price, 110);
  assert.equal(prices.philippines, null);
  assert.match(formatOilPrices(prices, now), /暂无可验证的菲律宾油价/);
  mock.restoreAll();
  mock.method(globalThis, 'fetch', async url => url === PH_FUEL_SOURCE
    ? new Response(fuelPage()) : new Response('rate limited', { status: 429 }));
  prices = await fetchOilPrices();
  assert.ok(prices.international.every(q => q.price === null));
  assert.match(formatOilPrices(prices, now), /Unleaded 91: ₱92.90\/L/);
});

test('output distinguishes Futures USD/barrel from NCR weekly PHP/liter and flags old data', () => {
  const prices = {
    international: [
      { symbol: 'BZ=F', price: 110, changePercent: 10, updatedAt: 1792180800 },
      { symbol: 'CL=F', price: 95, changePercent: -5, updatedAt: 1792094400 },
    ],
    philippines: { gasoline: 92.90, diesel: 91.65, publishedAt: '2026-10-13' },
  };
  const text = formatOilPrices(prices, now);
  assert.match(text, /USD\/桶 · Futures/);
  assert.match(text, /<code>Brent: \$110.00\s+🟢 \+10.00%<\/code>/);
  assert.match(text, /🔴 -5.00%/);
  assert.match(text, /2026-10-17 04:00 UTC\+8/);
  assert.match(text, /2026-10-16 04:00 UTC\+8/);
  assert.match(text, /Metro Manila \/ NCR/);
  assert.match(text, /数据日期：2026-10-13 · 每周平均参考价/);
  assert.match(text, /各加油站实际售价可能不同/);
  assert.match(text, /https:\/\/gaswatchph.com\//);
  assert.doesNotMatch(text, /超过 14 天|NaN|undefined/);
  assert.match(formatOilPrices(prices, now + 15 * 86_400_000), /数据已超过 14 天/);
});

test('group members can use /oil without price caching or link previews', async () => {
  const messages = [];
  mock.method(globalThis, 'fetch', async (url, options) => {
    if (new URL(url).hostname === 'api.telegram.org') {
      messages.push(JSON.parse(options.body));
      return Response.json({ ok: true });
    }
    return url === PH_FUEL_SOURCE ? new Response(fuelPage()) : quoteResponse(url);
  });
  const noKV = () => assert.fail('/oil must not list or delete KV');
  const kvCalls = [];
  const statusData = new Map();
  const env = {
    TELEGRAM_BOT_TOKEN: 'test-token', TELEGRAM_CHAT_ID: '-1001234567890',
    TELEGRAM_WEBHOOK_SECRET: 'test-secret',
    HN_STORIES: {
      get: async key => { kvCalls.push(key); return null; },
      put: async (key, value) => { kvCalls.push(key); statusData.set(key, value); },
      delete: noKV, list: noKV,
    },
  };
  const pending = [];
  const command = '/oil@ExampleBot';
  const response = await worker.fetch(new Request('https://worker.example/webhook', {
    method: 'POST', headers: { 'X-Telegram-Bot-Api-Secret-Token': 'test-secret' },
    body: JSON.stringify({ update_id: 1, message: {
      message_id: 1, date: 0, from: { id: 99, is_bot: false, first_name: 'Member' },
      chat: { id: -1001234567890, type: 'supergroup' }, text: command,
      entities: [{ type: 'bot_command', offset: 0, length: command.length }],
    } }),
  }), env, { waitUntil: promise => pending.push(promise) });
  await Promise.all(pending);
  assert.equal(response.status, 200);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].parse_mode, 'HTML');
  assert.equal(messages[0].chat_id, env.TELEGRAM_CHAT_ID);
  assert.match(messages[0].text, /Brent/);
  assert.match(messages[0].text, /Diesel/);
  assert.equal(messages[0].link_preview_options.is_disabled, true);
  assert.ok(kvCalls.every(key => /^status:v1:(oil|telegram)$/.test(key)));
  assert.equal(statusData.size, 2);
  assert.doesNotMatch([...statusData.values()].join(''), /91.65|92.9|gasoline|diesel/);
});
