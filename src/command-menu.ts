import commandText from '../commands.txt';
import type { Env } from './types';

type Command = { command: string; description: string };
type Scope = { type: string; chat_id?: string; user_id?: number };

async function call<T>(token: string, method: string, payload: unknown): Promise<T> {
  let response: Response;
  let data: { ok?: boolean; result?: T };
  try {
    response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(10000),
    });
    data = await response.json() as typeof data;
  } catch { throw new Error(`Telegram ${method} request failed`); }
  if (!response.ok || !data.ok || data.result === undefined) {
    throw new Error(`Telegram ${method} failed (HTTP ${response.status})`);
  }
  return data.result;
}

// Called only through the authenticated maintenance endpoint. No webhook changes.
export async function syncCommandMenus(env: Env, language = '') {
  if (!['', 'en', 'zh'].includes(language)) throw new Error('Unsupported command menu language');
  const token = env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_CHAT_ID.trim();
  const publicCommands: Command[] = commandText.trim().split(/\r?\n/).map(line => {
    const match = /^([a-z0-9_]+) - (.{1,256})$/.exec(line);
    if (!match) throw new Error('Invalid commands.txt');
    return { command: match[1], description: match[2] };
  }).filter(c => !['status', 'flushcache'].includes(c.command));
  const admins = await call<Array<{ status: string; user: { id: number; is_bot?: boolean } }>>(
    token, 'getChatAdministrators', { chat_id: chatId });
  if (!Array.isArray(admins)) throw new Error('Invalid administrator list');
  const owner = admins.find(a => a.status === 'creator');
  if (!owner || owner.user?.is_bot || !Number.isSafeInteger(owner.user?.id) || owner.user.id <= 0) {
    throw new Error('Cannot identify current group owner');
  }
  const publicScopes: Scope[] = [
    { type: 'default' },
    { type: 'all_private_chats' },
    { type: 'all_group_chats' },
    { type: 'all_chat_administrators' },
    { type: 'chat', chat_id: chatId },
    { type: 'chat_administrators', chat_id: chatId },
    ...admins.filter(a => !a.user.is_bot && a.user.id !== owner.user.id)
      .map(a => ({ type: 'chat_member', chat_id: chatId, user_id: a.user.id })),
  ];
  const ownerCommands = [...publicCommands,
    { command: 'status', description: 'Check source and webhook status (group owner only)' },
    { command: 'flushcache', description: 'Clear all cached data (group owner only)' },
  ];
  const scopes = [
    ...publicScopes.map(scope => ({ scope, commands: publicCommands })),
    { scope: { type: 'chat_member', chat_id: chatId, user_id: owner.user.id }, commands: ownerCommands },
  ];
  for (const { scope, commands } of scopes) {
    await call(token, 'setMyCommands', { scope, language_code: language, commands });
    const actual = await call<Command[]>(token, 'getMyCommands', { scope, language_code: language });
    if (!Array.isArray(actual) || actual.length !== commands.length
      || actual.some((command, i) => command.command !== commands[i].command
        || command.description !== commands[i].description)) {
      throw new Error('Telegram command menu verification failed');
    }
  }
  return { ok: true, language, verifiedScopes: scopes.length };
}

// Uses the existing shared secret; pending Telegram updates are preserved.
export async function migrateWebhook(env: Env) {
  const base = new URL(env.BRIEF_BASE_URL || '');
  if (base.protocol !== 'https:' || base.username || base.password || base.pathname !== '/'
    || base.search || base.hash || !env.TELEGRAM_WEBHOOK_SECRET) {
    throw new Error('A valid HTTPS brief origin and webhook secret are required');
  }
  const url = `${base.origin}/webhook`;
  await call(env.TELEGRAM_BOT_TOKEN, 'setWebhook', {
    url, secret_token: env.TELEGRAM_WEBHOOK_SECRET,
    allowed_updates: ['message'], drop_pending_updates: false,
  });
  const info = await call<{ url?: string; pending_update_count?: number }>(env.TELEGRAM_BOT_TOKEN, 'getWebhookInfo', {});
  if (info.url !== url) throw new Error('Webhook URL verification failed');
  return { ok: true, webhookUrl: url, pendingUpdates: info.pending_update_count ?? null };
}
