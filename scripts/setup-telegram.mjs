import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

async function telegramCall(token, method, payload = {}) {
  let response;
  let data;
  try {
    response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    });
    data = await response.json();
  } catch {
    // Fetch errors can contain the secret token in the request URL.
    throw new Error(`Telegram ${method} request failed`);
  }
  if (!response.ok || !data.ok) {
    throw new Error(`Telegram ${method} failed (HTTP ${response.status})`);
  }
  return data.result;
}

// Credentials come only from the process environment; never read local secret files.
export async function configureTelegram(env = process.env) {
  const token = env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_CHAT_ID?.trim();
  const secret = env.TELEGRAM_WEBHOOK_SECRET;
  if (!token || !chatId || !/^-[1-9]\d*$/.test(chatId)) {
    throw new Error('TELEGRAM_BOT_TOKEN and a numeric group TELEGRAM_CHAT_ID are required');
  }
  if (!secret || !/^[A-Za-z0-9_-]{32,256}$/.test(secret)) {
    throw new Error('TELEGRAM_WEBHOOK_SECRET must contain 32–256 letters, digits, underscores or hyphens');
  }
  const languages = [...new Set(['', 'en', 'zh',
    ...(env.TELEGRAM_COMMAND_LANGUAGES || '').split(',').map(value => value.trim()).filter(Boolean),
  ])];
  if (languages.some(language => language !== '' && !/^[a-z]{2}$/.test(language))) {
    throw new Error('TELEGRAM_COMMAND_LANGUAGES must contain comma-separated two-letter language codes');
  }

  const administrators = await telegramCall(token, 'getChatAdministrators', { chat_id: chatId });
  if (!Array.isArray(administrators)) throw new Error('Invalid Telegram administrator response');
  const owner = administrators.find(member => member.status === 'creator');
  if (!owner || owner.user?.is_bot || !Number.isSafeInteger(owner.user?.id) || owner.user.id <= 0) {
    throw new Error('Cannot identify the Telegram group owner; no settings were changed');
  }

  const currentWebhook = await telegramCall(token, 'getWebhookInfo');
  const webhookUrl = env.TELEGRAM_WEBHOOK_URL || currentWebhook?.url;
  let parsedUrl;
  try { parsedUrl = new URL(webhookUrl); } catch { /* handled below */ }
  if (!parsedUrl || parsedUrl.protocol !== 'https:' || parsedUrl.username || parsedUrl.password
    || parsedUrl.pathname !== '/webhook' || parsedUrl.search || parsedUrl.hash) {
    throw new Error('Set TELEGRAM_WEBHOOK_URL to the HTTPS Worker /webhook URL');
  }

  const commandText = await readFile(new URL('../commands.txt', import.meta.url), 'utf8');
  const publicCommands = commandText.trim().split(/\r?\n/).map(line => {
    const match = /^([a-z0-9_]+) - (.{1,256})$/.exec(line);
    if (!match) throw new Error('Invalid commands.txt entry');
    return { command: match[1], description: match[2] };
  }).filter(command => !['flushcache', 'status'].includes(command.command));

  // These scopes cover default menus and existing common language/admin overrides.
  const publicScopes = [
    { type: 'default' },
    { type: 'all_private_chats' },
    { type: 'all_group_chats' },
    { type: 'all_chat_administrators' },
    { type: 'chat', chat_id: chatId },
    { type: 'chat_administrators', chat_id: chatId },
    ...administrators.filter(member => member.user?.id !== owner.user.id && !member.user?.is_bot)
      .map(member => ({ type: 'chat_member', chat_id: chatId, user_id: member.user.id })),
  ];

  // The Worker must have the same secret before this call. Keep pending updates.
  await telegramCall(token, 'setWebhook', {
    url: parsedUrl.href,
    secret_token: secret,
    allowed_updates: ['message'],
    drop_pending_updates: false,
  });
  for (const scope of publicScopes) {
    for (const language_code of languages) {
      await telegramCall(token, 'setMyCommands', { scope, language_code, commands: publicCommands });
    }
  }
  const ownerScope = { type: 'chat_member', chat_id: chatId, user_id: owner.user.id };
  for (const language_code of languages) {
    await telegramCall(token, 'setMyCommands', {
      scope: ownerScope,
      language_code,
      commands: [...publicCommands,
        { command: 'status', description: 'Check data sources, request timing and webhook status (owner only)' },
        { command: 'flushcache', description: 'Clear all cached data (group owner only)' }],
    });
  }
  return { ownerId: owner.user.id, webhookUrl: parsedUrl.href };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  configureTelegram().then(() => {
    console.log('Webhook authentication and group-owner command menus configured.');
  }).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
