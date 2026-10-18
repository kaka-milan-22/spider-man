const assert = require('node:assert/strict');
const { test } = require('node:test');
require('./register-typescript.cjs');
const { observe, formatStatus, STATUS_PREFIX } = require('../src/monitoring.ts');

function memoryKV() {
  const data = new Map();
  return { data, get: async key => data.has(key) ? JSON.parse(data.get(key)) : null,
    put: async (key, value) => { assert.ok(key.startsWith(STATUS_PREFIX)); data.set(key, value); } };
}

test('persists metadata only and retains last successful time after a failure', async () => {
  const kv = memoryKV();
  const quote = { price: 123.45, secret: 'never-persist-me' };
  assert.equal(await observe(kv, 'market', async () => quote), quote);
  const previous = JSON.parse(kv.data.get(STATUS_PREFIX + 'market'));
  assert.equal(previous.ok, true);
  assert.ok(previous.lastSuccessAt > 0);
  assert.doesNotMatch(kv.data.get(STATUS_PREFIX + 'market'), /price|secret|123.45|never-persist/);
  await assert.rejects(observe(kv, 'market', async () => { throw new Error('HTTP 429 from https://private.example?token=never-persist-me'); }));
  const failed = JSON.parse(kv.data.get(STATUS_PREFIX + 'market'));
  assert.equal(failed.lastSuccessAt, previous.lastSuccessAt);
  assert.equal(failed.ok, false);
  assert.match(failed.detail, /HTTP 429/);
  assert.doesNotMatch(JSON.stringify(failed), /private.example|token|never-persist/);
});

test('observation storage failures cannot prevent replies or hide the actual source failure', async () => {
  const kv = { get: async () => { throw new Error('KV offline'); }, put: async () => {} };
  assert.equal(await observe(kv, 'market', async () => 'result'), 'result');
  await assert.rejects(observe(kv, 'market', async () => { throw new Error('source failure'); }), /source failure/);
});

test('status distinguishes unknown/partial results and escapes metadata in HTML', async () => {
  const kv = memoryKV();
  await observe(kv, 'market', async () => [], () => ({ ok: false, detail: '2/5 项可用 <bad>' }));
  kv.data.set(STATUS_PREFIX + 'stocks', JSON.stringify({ checkedAt: 'malformed' }));
  const text = await formatStatus(kv, { configured: true, pendingUpdates: 3, lastErrorAt: 1792310000, lastError: 'HTTP 403' });
  assert.match(text, /待投递 3 条/);
  assert.match(text, /Stocks \/ Yahoo：暂无调用记录/);
  assert.match(text, /2\/5 项可用 &lt;bad&gt;/);
  assert.match(text, /成功：暂无/);
  assert.match(text, /不代表已检测上游/);
  assert.doesNotMatch(text, /NaN|undefined/);
});
