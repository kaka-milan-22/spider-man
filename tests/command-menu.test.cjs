const assert = require('node:assert/strict');
const { test, afterEach, mock } = require('node:test');
require('./register-typescript.cjs');
const { syncCommandMenus, migrateWebhook } = require('../src/command-menu.ts');
const worker = require('../src/index.ts').default;

afterEach(() => mock.restoreAll());
const env = { TELEGRAM_BOT_TOKEN: 'test-token', TELEGRAM_CHAT_ID: '-1001234567890' };

test('menu synchronization verifies public/admin/owner scopes for all supported languages', async () => {
  const saved = new Map();
  const calls = [];
  mock.method(globalThis, 'fetch', async (url, options) => {
    const method = new URL(url).pathname.split('/').pop();
    const p = JSON.parse(options.body);
    calls.push({ method, p });
    if (method === 'getChatAdministrators') return Response.json({ ok: true, result: [
      { status: 'creator', user: { id: 42 } },
      { status: 'administrator', user: { id: 99 } },
      { status: 'administrator', user: { id: 100, is_bot: true } },
    ] });
    const key = JSON.stringify([p.scope, p.language_code]);
    if (method === 'setMyCommands') { saved.set(key, p.commands); return Response.json({ ok: true, result: true }); }
    if (method === 'getMyCommands') return Response.json({ ok: true, result: saved.get(key) });
    assert.fail('Unexpected Telegram call');
  });
  for (const language of ['', 'en', 'zh']) {
    assert.equal((await syncCommandMenus(env, language)).verifiedScopes, 4);
  }
  const updates = calls.filter(c => c.method === 'setMyCommands');
  assert.equal(updates.length, 12);
  for (const { p } of updates) {
    assert.equal(p.commands[0].command, 'brief');
    const privileged = p.scope.type === 'chat_member' && p.scope.user_id === 42;
    assert.equal(p.commands.some(c => c.command === 'status'), privileged);
    assert.equal(p.commands.some(c => c.command === 'flushcache'), privileged);
  }
  assert.ok(!calls.some(c => c.method === 'setWebhook'));
});

test('sync endpoint fails closed without its temporary token and never uses the webhook secret instead', async () => {
  mock.method(globalThis, 'fetch', async () => assert.fail('No Telegram calls allowed'));
  for (const extra of [{}, { TELEGRAM_WEBHOOK_SECRET: 'webhook-secret' }, { COMMAND_SYNC_TOKEN: 'different-token' }]) {
    const r = await worker.fetch(new Request('https://worker.example/admin/commands/sync', {
      method: 'POST', headers: { 'X-Telegram-Bot-Api-Secret-Token': 'webhook-secret' },
    }), { ...env, ...extra }, {});
    assert.equal(r.status, 403);
  }
});

test('sync never claims success if Telegram readback does not match', async () => {
  mock.method(globalThis, 'fetch', async url => {
    const method = new URL(url).pathname.split('/').pop();
    return Response.json({ ok: true, result: method === 'getChatAdministrators'
      ? [{ status: 'creator', user: { id: 42 } }] : method === 'getMyCommands' ? [] : true });
  });
  await assert.rejects(syncCommandMenus(env), /verification failed/);
});

test('sync refuses unidentified owners before changing any menus', async () => {
  let calls = 0;
  mock.method(globalThis, 'fetch', async () => { calls++; return Response.json({ ok: true, result: [] }); });
  await assert.rejects(syncCommandMenus(env), /group owner/);
  assert.equal(calls, 1);
});

test('webhook migration uses the custom domain, preserves shared secret and pending updates, and verifies readback', async () => {
  const requests = [];
  mock.method(globalThis, 'fetch', async (url, options) => {
    const method = new URL(url).pathname.split('/').pop();
    requests.push({ method, payload: JSON.parse(options.body) });
    return Response.json({ ok: true, result: method === 'setWebhook'
      ? true : { url: 'https://econ.kakacn.com/webhook', pending_update_count: 0 } });
  });
  const result = await migrateWebhook({ ...env, BRIEF_BASE_URL: 'https://econ.kakacn.com', TELEGRAM_WEBHOOK_SECRET: 'existing-secret' });
  assert.equal(result.webhookUrl, 'https://econ.kakacn.com/webhook');
  assert.deepEqual(requests.map(r => r.method), ['setWebhook', 'getWebhookInfo']);
  assert.equal(requests[0].payload.secret_token, 'existing-secret');
  assert.equal(requests[0].payload.drop_pending_updates, false);
  assert.deepEqual(requests[0].payload.allowed_updates, ['message']);
  assert.doesNotMatch(JSON.stringify(result), /existing-secret|test-token/);
});

test('webhook migration fails without a shared secret and rejects a mismatched readback', async () => {
  const configured = { ...env, BRIEF_BASE_URL: 'https://econ.kakacn.com' };
  mock.method(globalThis, 'fetch', async url => Response.json({ ok: true,
    result: String(url).endsWith('setWebhook') ? true : { url: 'https://old.example/webhook' },
  }));
  await assert.rejects(migrateWebhook(configured), /secret are required/);
  await assert.rejects(migrateWebhook({ ...configured, TELEGRAM_WEBHOOK_SECRET: 'existing-secret' }), /verification failed/);
  const response = await worker.fetch(new Request('https://econ.kakacn.com/admin/webhook/migrate', { method: 'POST' }), configured, {});
  assert.equal(response.status, 403);
});
