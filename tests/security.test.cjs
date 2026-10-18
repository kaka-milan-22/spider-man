const assert = require('node:assert/strict');
const { test, beforeEach, afterEach, mock } = require('node:test');
require('./register-typescript.cjs');
const worker = require('../src/index.ts').default;
const { parseCommand } = require('../src/telegram.ts');
const groupId = -1001234567890;
const secret = 'test-webhook-secret-with-at-least-32-characters';
let env, calls, deleted, ownerId, failOwnerLookup;

beforeEach(() => {
  calls = [];
  deleted = [];
  ownerId = 42;
  failOwnerLookup = false;
  env = {
    TELEGRAM_BOT_TOKEN: 'test-token',
    TELEGRAM_CHAT_ID: String(groupId),
    TELEGRAM_WEBHOOK_SECRET: secret,
    HN_STORIES: {
      list: mock.fn(async ({ cursor }) => cursor
        ? { keys: [{ name: 'eth:brief' }], list_complete: true }
        : { keys: [{ name: 'hn:top10' }], list_complete: false, cursor: 'next-page' }),
      delete: mock.fn(async key => deleted.push(key)),
      get: mock.fn(async () => []),
      put: mock.fn(async () => {}),
    },
  };
  mock.method(globalThis, 'fetch', async (url, options) => {
    const method = String(url).split('/').pop();
    const payload = options?.body ? JSON.parse(options.body) : undefined;
    calls.push({ method, payload });
    if (method === 'getChatAdministrators') {
      if (failOwnerLookup) throw new Error('simulated network failure');
      return Response.json({ ok: true, result: [
        { status: 'creator', user: { id: ownerId } },
        { status: 'administrator', user: { id: 43 } },
      ] });
    }
    if (method === 'sendMessage') return Response.json({ ok: true });
    throw new Error(`Unexpected API call: ${method}`);
  });
});
afterEach(() => mock.restoreAll());

function update(userId = 42, command = '/flushcache', overrides = {}) {
  return {
    update_id: 100,
    message: {
      message_id: 10,
      date: 0,
      from: { id: userId, is_bot: false, first_name: 'Test' },
      chat: { id: groupId, type: 'supergroup' },
      text: command,
      entities: [{ type: 'bot_command', offset: 0, length: command.length }],
      ...overrides,
    },
  };
}

async function deliver(body, suppliedSecret = secret, path = '/webhook', method = 'POST') {
  const pending = [];
  const headers = { 'Content-Type': 'application/json' };
  if (suppliedSecret !== null) headers['X-Telegram-Bot-Api-Secret-Token'] = suppliedSecret;
  const request = new Request(`https://worker.example${path}`, {
    method, headers,
    ...(method !== 'GET' ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
  });
  const response = await worker.fetch(request, env, { waitUntil: promise => pending.push(promise) });
  await Promise.all(pending);
  return response;
}

test('rejects missing/wrong webhook secrets before parsing JSON or touching KV', async () => {
  for (const supplied of [null, '', 'forged-secret']) {
    assert.equal((await deliver('not JSON', supplied)).status, 403);
  }
  assert.equal(calls.length, 0);
  assert.equal(env.HN_STORIES.list.mock.callCount(), 0);
});

test('fails closed when the Worker webhook secret is not configured', async () => {
  delete env.TELEGRAM_WEBHOOK_SECRET;
  assert.equal((await deliver(update())).status, 403);
  assert.equal(calls.length, 0);
});

test('ignores all commands from other groups and private chats', async () => {
  for (const command of ['/flushcache', '/status', '/market', '/calendar', '/btc', '/stocks', '/oil', '/top10hn', '/top10ars', '/exrate', '/eth']) {
    for (const chat of [{ id: groupId - 1, type: 'supergroup' }, { id: 42, type: 'private' }]) {
      assert.equal((await deliver(update(42, command, { chat }))).status, 200);
    }
  }
  assert.equal(calls.length, 0);
  assert.equal(env.HN_STORIES.get.mock.callCount(), 0);
  assert.equal(env.HN_STORIES.list.mock.callCount(), 0);
});

test('ordinary members can use public commands in the configured group', async () => {
  assert.equal((await deliver(update(99, '/top10hn'))).status, 200);
  assert.deepEqual(calls.map(call => call.method), ['sendMessage']);
  assert.equal(calls[0].payload.chat_id, String(groupId));
});

test('both ordinary members and administrators cannot clear cache or elicit a reply', async () => {
  for (const userId of [99, 43]) await deliver(update(userId));
  assert.equal(env.HN_STORIES.list.mock.callCount(), 0);
  assert.deepEqual(calls.map(call => call.method), ['getChatAdministrators', 'getChatAdministrators']);
});

test('the group owner can clear all cache pages', async () => {
  assert.equal((await deliver(update())).status, 200);
  assert.deepEqual(deleted, ['hn:top10', 'eth:brief']);
  assert.equal(calls[0].payload.chat_id, String(groupId));
  assert.match(calls[1].payload.text, /2/);
});

test('ownership is rechecked and a former owner immediately loses permission', async () => {
  await deliver(update(42));
  ownerId = 99;
  await deliver(update(42));
  assert.equal(deleted.length, 2);
  await deliver(update(99));
  assert.equal(deleted.length, 4);
});

test('owner lookup failures do not touch cache or send a success message', async () => {
  failOwnerLookup = true;
  assert.equal((await deliver(update())).status, 200);
  assert.equal(env.HN_STORIES.list.mock.callCount(), 0);
  assert.deepEqual(calls.map(call => call.method), ['getChatAdministrators']);
});

test('failed or incomplete Telegram owner responses never authorize cache deletion', async () => {
  for (const result of [
    { ok: false, description: 'Forbidden' },
    { ok: true, result: [] },
    { ok: true, result: [{ status: 'administrator', user: { id: 42 } }] },
  ]) {
    mock.restoreAll();
    mock.method(globalThis, 'fetch', async () => Response.json(result));
    await deliver(update());
  }
  assert.equal(env.HN_STORIES.list.mock.callCount(), 0);
  assert.equal(deleted.length, 0);
});

test('missing, bot and anonymous sender identities cannot clear cache', async () => {
  for (const overrides of [
    { from: undefined },
    { from: { id: 42, is_bot: true } },
    { sender_chat: { id: groupId, type: 'supergroup' } },
  ]) await deliver(update(42, '/flushcache', overrides));
  assert.equal(calls.length, 0);
  assert.equal(env.HN_STORIES.list.mock.callCount(), 0);
});

test('supports a group command addressed to the bot and propagates sender identity', () => {
  assert.deepEqual(parseCommand(update(42, '/flushcache@ExampleBot')), {
    command: '/flushcache', chatId: groupId, chatType: 'supergroup', userId: 42,
  });
});

test('manual trigger requires POST and a valid secret', async () => {
  assert.equal((await deliver({}, secret, '/trigger', 'GET')).status, 405);
  assert.equal((await deliver({}, null, '/trigger')).status, 403);
  assert.equal(calls.length, 0);
  assert.equal((await deliver({}, secret, '/trigger')).status, 200);
  assert.deepEqual(calls.map(call => call.method), ['sendMessage']);
});

test('health remains available without credentials', async () => {
  assert.equal((await deliver({}, null, '/health', 'GET')).status, 200);
  assert.equal(calls.length, 0);
});

test('scheduled digest continues to work without the HTTP secret', async () => {
  delete env.TELEGRAM_WEBHOOK_SECRET;
  const pending = [];
  await worker.scheduled({}, env, { waitUntil: promise => pending.push(promise) });
  await Promise.all(pending);
  assert.deepEqual(calls.map(call => call.method), ['sendMessage']);
  assert.equal(calls[0].payload.chat_id, String(groupId));
});

test('setup registers authenticated webhook and exposes flushcache only in the owner scope', async () => {
  const { configureTelegram } = await import('../scripts/setup-telegram.mjs');
  mock.restoreAll();
  mock.method(globalThis, 'fetch', async (url, options) => {
    const method = String(url).split('/').pop();
    const payload = JSON.parse(options.body);
    calls.push({ method, payload });
    const result = method === 'getChatAdministrators'
      ? [{ status: 'creator', user: { id: 42 } }, { status: 'administrator', user: { id: 43 } }]
      : method === 'getWebhookInfo' ? { url: 'https://worker.example/webhook' } : true;
    return Response.json({ ok: true, result });
  });
  await configureTelegram(env);
  const webhook = calls.find(call => call.method === 'setWebhook').payload;
  assert.equal(webhook.secret_token, secret);
  assert.equal(webhook.drop_pending_updates, false);
  const menus = calls.filter(call => call.method === 'setMyCommands');
  assert.ok(menus.length > 0);
  for (const { payload } of menus) {
    const hasFlush = payload.commands.some(command => command.command === 'flushcache');
    assert.equal(hasFlush, payload.scope.type === 'chat_member' && payload.scope.user_id === 42);
    assert.equal(payload.commands.some(command => command.command === 'status'), hasFlush);
    assert.ok(payload.commands.some(command => command.command === 'market'));
    assert.ok(payload.commands.some(command => command.command === 'calendar'));
    assert.ok(!payload.commands.some(command => command.command === 'alert'));
    assert.ok(payload.commands.some(command => command.command === 'top10hn'));
    assert.ok(payload.commands.some(command => command.command === 'stocks'));
    assert.ok(payload.commands.some(command => command.command === 'oil'));
  }
  assert.ok(menus.some(({ payload }) => payload.scope.type === 'chat' && payload.language_code === ''));
  assert.ok(menus.some(({ payload }) => payload.scope.type === 'chat_administrators'));
});

test('status silently rejects members, other admins and anonymous senders before reading monitoring data', async () => {
  await deliver(update(99, '/status'));
  await deliver(update(43, '/status'));
  await deliver(update(42, '/status', { sender_chat: { id: groupId, type: 'supergroup' } }));
  assert.deepEqual(calls.map(c => c.method), ['getChatAdministrators', 'getChatAdministrators']);
  assert.equal(env.HN_STORIES.get.mock.callCount(), 0);
});

test('owner status queries webhook safely and does not expose webhook URLs or credentials', async () => {
  mock.restoreAll();
  mock.method(globalThis, 'fetch', async (url, options) => {
    const method = String(url).split('/').pop();
    const payload = options?.body ? JSON.parse(options.body) : undefined;
    calls.push({ method, payload });
    if (method === 'getChatAdministrators') return Response.json({ ok: true, result: [{ status: 'creator', user: { id: 42 } }] });
    if (method === 'getWebhookInfo') return Response.json({ ok: true, result: {
      url: 'https://private.example/webhook', pending_update_count: 2,
      last_error_date: 1792310000, last_error_message: 'Wrong response 403 from https://private.example?token=secret',
    } });
    return Response.json({ ok: true });
  });
  await deliver(update(42, '/status'));
  const text = calls.find(c => c.method === 'sendMessage').payload.text;
  assert.match(text, /待投递 2 条/);
  assert.match(text, /HTTP 403/);
  assert.doesNotMatch(text, /private.example|token|secret/);
  assert.ok(env.HN_STORIES.get.mock.callCount() >= 10);
});

test('calendar arguments survive bot mention parsing and invalid ranges return usage without external data requests', async () => {
  const body = update(99, '/calendar@ExampleBot');
  body.message.text += ' 30';
  assert.equal(parseCommand(body).args, '30');
  body.message.text = '/calendar@ExampleBot 365';
  await deliver(body);
  assert.deepEqual(calls.map(c => c.method), ['sendMessage']);
  assert.match(calls[0].payload.text, /用法/);
});

test('setup refuses missing webhook secret before making API calls', async () => {
  const { configureTelegram } = await import('../scripts/setup-telegram.mjs');
  await assert.rejects(configureTelegram({ ...env, TELEGRAM_WEBHOOK_SECRET: undefined }), /WEBHOOK_SECRET/);
  assert.equal(calls.length, 0);
});

test('setup does not mutate Telegram settings if it cannot find the group owner', async () => {
  const { configureTelegram } = await import('../scripts/setup-telegram.mjs');
  mock.restoreAll();
  mock.method(globalThis, 'fetch', async (url) => {
    calls.push({ method: String(url).split('/').pop() });
    return Response.json({ ok: true, result: [{ status: 'administrator', user: { id: 43 } }] });
  });
  await assert.rejects(configureTelegram(env), /group owner/);
  assert.deepEqual(calls.map(call => call.method), ['getChatAdministrators']);
});
