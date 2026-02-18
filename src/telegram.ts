import {
  TelegramMessagePayload,
  TelegramResponse,
  TelegramAPIError,
  ProcessedStory,
} from './types';
import { formatDailyDigest } from './formatters';

const TELEGRAM_API_BASE = 'https://api.telegram.org/bot';

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
