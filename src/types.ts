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
  keywords: string[];
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

/**
 * Environment Variables
 */

export interface Env {
  // KV Namespace
  HN_STORIES: KVNamespace;

  // Secrets
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_CHAT_ID: string;

  // Config
  HN_TOP_N?: string;
}

/**
 * Configuration
 */

export interface Config {
  telegramBotToken: string;
  telegramChatId: string;
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

export class KeywordExtractionError extends Error {
  constructor(message: string, public cause?: Error) {
    super(message);
    this.name = 'KeywordExtractionError';
  }
}
