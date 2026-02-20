/**
 * Hacker News API Types
 */

export interface HNStory {
  id: number;
  title: string;
  url?: string;
  score: number;
  by: string;
  time: number;
  descendants?: number;
  type: 'story';
  kids?: number[];
}

export interface ProcessedStory {
  id: number;
  title: string;
  url: string;
  score: number;
  author: string;
  time: number;
  commentCount: number;
}
 
/**
 * Ars Technica RSS Types
 */

export interface ArsArticle {
  title: string;
  url: string;
  excerpt: string;
  publishedAt: string;
  author: string;
}

export class ArsAPIError extends Error {
  constructor(message: string, public cause?: Error) {
    super(message);
    this.name = 'ArsAPIError';
  }
}

/**
 * Telegram API Types
 */

export interface TelegramMessagePayload {
  chat_id: string;
  text: string;
  parse_mode?: 'Markdown' | 'MarkdownV2' | 'HTML';
  disable_web_page_preview?: boolean;
}

export interface TelegramResponse {
  ok: boolean;
  result?: {
    message_id: number;
    chat: {
      id: number;
      type: string;
    };
    date: number;
    text: string;
  };
  description?: string;
  error_code?: number;
}

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from?: {
      id: number;
      is_bot: boolean;
      first_name: string;
      username?: string;
    };
    chat: {
      id: number;
      type: string;
      title?: string;
    };
    date: number;
    text?: string;
    entities?: TelegramMessageEntity[];
  };
}

export interface TelegramMessageEntity {
  type: 'bot_command' | 'mention' | 'hashtag' | string;
  offset: number;
  length: number;
}

/**
 * Environment Variables
 */

export interface Env {
  // KV Namespace
  HN_STORIES: KVNamespace;

  // Secrets
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_CHAT_ID: string;
  // Currency API (optional)
  CURRENCY_API_KEY?: string;

  // Config
  HN_TOP_N?: string;
}

/**
 * Configuration
 */

export interface Config {
  telegramBotToken: string;
  telegramChatId: string;
  currencyApiKey?: string;
  hnTopN: number;
}

/**
 * Error Types
 */

export class HNAPIError extends Error {
  constructor(message: string, public cause?: Error) {
    super(message);
    this.name = 'HNAPIError';
  }
}

export class TelegramAPIError extends Error {
  constructor(
    message: string,
    public errorCode?: number,
    public cause?: Error
  ) {
    super(message);
    this.name = 'TelegramAPIError';
  }
}
