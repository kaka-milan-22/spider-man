import { Config, Env } from './types';

export function getConfig(env: Env): Config {
  const telegramBotToken = env.TELEGRAM_BOT_TOKEN;
  const telegramChatId = env.TELEGRAM_CHAT_ID;

  if (!telegramBotToken || telegramBotToken.trim() === '') {
    throw new Error(
      'TELEGRAM_BOT_TOKEN is required. Please set it via: wrangler secret put TELEGRAM_BOT_TOKEN'
    );
  }

  if (!telegramChatId || telegramChatId.trim() === '') {
    throw new Error(
      'TELEGRAM_CHAT_ID is required. Please set it via: wrangler secret put TELEGRAM_CHAT_ID'
    );
  }

  const hnTopN = env.HN_TOP_N ? parseInt(env.HN_TOP_N, 10) : 10;

  return {
    telegramBotToken,
    telegramChatId,
    hnTopN: isNaN(hnTopN) ? 10 : hnTopN,
  };
}
