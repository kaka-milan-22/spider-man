import {
  TelegramMessagePayload,
  TelegramResponse,
  TelegramAPIError,
  ProcessedStory,
  TelegramUpdate,
} from './types';
import { formatDailyDigest, formatStoriesRange } from './formatters';

const TELEGRAM_API_BASE = 'https://api.telegram.org/bot';

export function parseCommand(update: TelegramUpdate): {
  command: string | null;
  chatId: number;
} | null {
  if (!update.message?.text) {
    return null;
  }

  const text = update.message.text;
  const entities = update.message.entities || [];

  for (const entity of entities) {
    if (entity.type === 'bot_command') {
      const command = text.slice(entity.offset, entity.offset + entity.length);
      const commandName = command.split('@')[0].toLowerCase();
      return {
        command: commandName,
        chatId: update.message.chat.id,
      };
    }
  }

  return null;
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

export async function sendMessage(
  botToken: string,
  chatId: string,
  text: string
): Promise<void> {
  const url = `${TELEGRAM_API_BASE}${botToken}/sendMessage`;

  const payload: TelegramMessagePayload = {
    chat_id: chatId,
    text: text,
    parse_mode: 'Markdown',
    disable_web_page_preview: false,
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
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
