import {
  TelegramMessagePayload,
  TelegramResponse,
  TelegramAPIError,
  ProcessedStory,
  TelegramUpdate,
} from './types';
import { formatDailyDigest, formatStoriesRange } from './formatters';
import type { WebhookStatus } from './monitoring';

const TELEGRAM_API_BASE = 'https://api.telegram.org/bot';

export function parseCommand(update: TelegramUpdate): {
  command: string | null;
  chatId: number;
  chatType: string;
  userId?: number;
  args?: string;
} | null {
  if (typeof update?.message?.text !== 'string' || !update.message.chat) {
    return null;
  }

  const text = update.message.text;
  const entities = update.message.entities || [];
  const sender = update.message.from;
  const userId = !update.message.sender_chat && sender && !sender.is_bot
    && Number.isSafeInteger(sender.id) && sender.id > 0 ? sender.id : undefined;

  for (const entity of entities) {
    if (entity.type === 'bot_command' && entity.offset === 0) {
      const command = text.slice(entity.offset, entity.offset + entity.length);
      const commandName = command.split('@')[0].toLowerCase();
      return {
        command: commandName,
        chatId: update.message.chat.id,
        chatType: update.message.chat.type,
        userId,
        ...(text.slice(entity.offset + entity.length).trim()
          ? { args: text.slice(entity.offset + entity.length).trim() } : {}),
      };
    }
  }

  return null;
}

export async function getWebhookStatus(botToken: string): Promise<WebhookStatus> {
  try {
    const response = await fetch(`${TELEGRAM_API_BASE}${botToken}/getWebhookInfo`, {
      signal: AbortSignal.timeout(5000),
    });
    const data = await response.json() as { ok?: boolean; result?: {
      url?: string; pending_update_count?: number; last_error_date?: number; last_error_message?: string;
    } };
    const info = data.result;
    if (!response.ok || !data.ok || !info || !Number.isSafeInteger(info.pending_update_count)
      || info.pending_update_count! < 0) throw new Error('Invalid webhook status');
    const code = info.last_error_message?.match(/\b[45]\d{2}\b/)?.[0];
    return {
      configured: Boolean(info.url), pendingUpdates: info.pending_update_count!,
      ...(typeof info.last_error_date === 'number' && info.last_error_date > 0
        ? { lastErrorAt: info.last_error_date, lastError: code ? `HTTP ${code}` : '投递失败' } : {}),
    };
  } catch { throw new TelegramAPIError('Unable to query Telegram webhook status'); }
}

// Query Telegram on every privileged operation so ownership transfers take effect immediately.
export async function getGroupOwnerId(botToken: string, chatId: string): Promise<number> {
  try {
    const response = await fetch(`${TELEGRAM_API_BASE}${botToken}/getChatAdministrators`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId }),
      signal: AbortSignal.timeout(5000),
    });
    const data = await response.json() as {
      ok: boolean;
      result?: Array<{ status: string; user: { id: number; is_bot?: boolean } }>;
    };
    if (response.ok && data.ok && Array.isArray(data.result)) {
      const owner = data.result.find(member => member.status === 'creator');
      if (owner && !owner.user.is_bot && Number.isSafeInteger(owner.user.id) && owner.user.id > 0) {
        return owner.user.id;
      }
    }
  } catch {
    // Do not log fetch errors containing the bot-token URL. Fail closed.
  }
  throw new TelegramAPIError('Unable to verify the Telegram group owner');
}

export function getCommandRange(command: string): { start: number; end: number } | null {
  switch (command) {
    case '/top10hn':
      return { start: 1, end: 10 };
    case '/top10ars':
      return { start: 1, end: 10 };
    default:
      return null;
  }
}

export function isFlushCacheCommand(command: string): boolean {
  return command === '/flushcache';
}

export function isCryptoCommand(command: string): boolean {
  return command === '/btc';
}

// Detect /exrate command
export function isExRateCommand(command: string): boolean {
  return command === '/exrate';
}

// Detect /eth command
export function isEthCommand(command: string): boolean {
  return command === '/eth';
}

export async function sendMessage(
  botToken: string,
  chatId: string,
  text: string,
  options: { disableLinkPreview?: boolean } = {}
): Promise<void> {
  const url = `${TELEGRAM_API_BASE}${botToken}/sendMessage`;

  const payload: TelegramMessagePayload = {
    chat_id: chatId,
    text: text,
    parse_mode: text.includes('<') ? 'HTML' : 'Markdown',
    link_preview_options: { is_disabled: options.disableLinkPreview ?? false },
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });

    const data = (await response.json()) as TelegramResponse;

    if (!data.ok) {
      throw new TelegramAPIError(
        `Telegram API error: ${data.description || 'Unknown error'}`,
        data.error_code
      );
    }
  } catch (error) {
    if (error instanceof TelegramAPIError) {
      throw error;
    }
    throw new TelegramAPIError(
      'Failed to send message to Telegram',
      undefined,
      error instanceof Error ? error : undefined
    );
  }
}

export async function sendDigest(
  botToken: string,
  chatId: string,
  stories: ProcessedStory[],
  date: Date
): Promise<void> {
  const message = formatDailyDigest(stories, date);
  await sendMessage(botToken, chatId, message);
}

export async function sendStoriesRange(
  botToken: string,
  chatId: string,
  stories: ProcessedStory[],
  start: number,
  end: number
): Promise<void> {
  const message = formatStoriesRange(stories, start, end);
  await sendMessage(botToken, chatId, message);
}
