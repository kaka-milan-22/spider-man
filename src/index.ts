import { Env, ProcessedStory, HNStory, TelegramUpdate } from './types';
import { getConfig } from './config';
import { getStoriesByRange } from './hn-api';
import { fetchCryptoPrices, formatCryptoPrices } from './crypto';
import {
  sendDigest,
  sendStoriesRange,
  parseCommand,
  isFlushCacheCommand,
  isCryptoCommand,
  isExRateCommand,
  isEthCommand,
  sendMessage,
} from './telegram';
import { getArsTopStories } from './ars-api';
import { formatArsArticles } from './formatters';
import { fetchExchangeRates, formatExchangeRates } from './exrate-api';
import { fetchAndFormatEthBrief } from './eth-brief';

async function flushCache(kv: KVNamespace): Promise<number> {
  let deleted = 0;
  let cursor: string | undefined;

  do {
    const list = await kv.list({ cursor });
    await Promise.all(list.keys.map(key => kv.delete(key.name)));
    deleted += list.keys.length;
    cursor = list.list_complete ? undefined : list.cursor;
  } while (cursor);

  return deleted;
}

function processStory(story: HNStory): ProcessedStory | null {
  if (!story.url) {
    console.warn(`Story ${story.id} has no URL, skipping`);
    return null;
  }

  return {
    id: story.id,
    title: story.title,
    url: story.url,
    score: story.score,
    author: story.by,
    time: story.time,
    commentCount: story.descendants || 0,
  };
}

const HN_CACHE_KEY = 'hn:top10';
const HN_CACHE_TTL = 3600; // 60 minutes

async function fetchTopHNStories(kv: KVNamespace): Promise<ProcessedStory[]> {
  try {
    const cached = await kv.get(HN_CACHE_KEY, 'json');
    if (cached) {
      console.log('Cache hit for HN top stories');
      return cached as ProcessedStory[];
    }

    const stories = await getStoriesByRange(1, 10);
    const processed = stories.map(processStory).filter((s): s is ProcessedStory => s !== null);

    if (processed.length > 0) {
      await kv.put(HN_CACHE_KEY, JSON.stringify(processed), { expirationTtl: HN_CACHE_TTL });
      console.log(`Cached ${processed.length} HN stories`);
    }

    return processed;
  } catch (error) {
    console.error('Error fetching HN stories:', error);
    try {
      const cached = await kv.get(HN_CACHE_KEY, 'json');
      if (cached) {
        console.log('Returning cached data after fetch error');
        return cached as ProcessedStory[];
      }
    } catch (cacheError) {
      console.warn('Failed to read fallback cache:', cacheError);
    }
    return [];
  }
}

async function handleScheduled(env: Env): Promise<void> {
  console.log('Starting HN Telegram Bot scheduled job');
  const config = getConfig(env);
  const processedStories = await fetchTopHNStories(env.HN_STORIES);
  console.log(`Fetched ${processedStories.length} stories`);
  await sendDigest(config.telegramBotToken, config.telegramChatId, processedStories, new Date());
  console.log('Digest sent successfully');
}

async function handleCommand(
  env: Env,
  command: string,
  chatId: number
): Promise<void> {
  const config = getConfig(env);

  try {
    if (isFlushCacheCommand(command)) {
      console.log(`Processing flush cache command for chat ${chatId}`);
      const deleted = await flushCache(env.HN_STORIES);
      await sendMessage(config.telegramBotToken, String(chatId), `✅ 已清除 ${deleted} 条缓存记录`);
      console.log(`Flushed ${deleted} cache entries`);
      return;
    }

    if (isCryptoCommand(command)) {
      console.log(`Processing crypto command for chat ${chatId}`);
      const prices = await fetchCryptoPrices();
      const message = formatCryptoPrices(prices);
      await sendMessage(config.telegramBotToken, String(chatId), message);
      console.log(`Sent ${prices.length} crypto prices`);
      return;
    }

    if (isExRateCommand(command)) {
      console.log(`Processing /exrate command for chat ${chatId}`);
      if (!config.currencyApiKey) {
        await sendMessage(config.telegramBotToken, String(chatId), '❌ Currency API key not configured. Please contact the bot admin.');
        return;
      }
      const rates = await fetchExchangeRates(config.currencyApiKey, env.HN_STORIES);
      const message = formatExchangeRates(rates);
      await sendMessage(config.telegramBotToken, String(chatId), message);
      console.log(`Sent exchange rates`);
      return;
    }

    if (command === '/top10ars') {
      const articles = await getArsTopStories(env.HN_STORIES);
      const message = formatArsArticles(articles);
      await sendMessage(config.telegramBotToken, String(chatId), message);
      console.log(`Sent ${articles.length} Ars Technica articles`);
      return;
    }

    if (command === '/top10hn') {
      console.log(`Processing /top10hn for chat ${chatId}`);
      const processedStories = await fetchTopHNStories(env.HN_STORIES);
      await sendStoriesRange(config.telegramBotToken, String(chatId), processedStories, 1, 10);
      console.log(`Sent ${processedStories.length} stories`);
    }

    if (isEthCommand(command)) {
      console.log(`Processing /eth command for chat ${chatId}`);
      const message = await fetchAndFormatEthBrief();
      await sendMessage(config.telegramBotToken, String(chatId), message);
      console.log('Sent ETH brief');
      return;
    }
  } catch (error) {
    console.error(`Error handling command ${command}:`, error);
    const reason = error instanceof Error ? error.message : String(error);
    const truncated = reason.length > 3800 ? reason.slice(0, 3800) + '…' : reason;
    try {
      await sendMessage(
        config.telegramBotToken,
        String(chatId),
        `❌ <b>${command}</b> 执行失败\n<code>${truncated}</code>`
      );
    } catch (sendError) {
      console.error('Failed to send error message:', sendError);
    }
  }
}

export default {
  async scheduled(
    controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    ctx.waitUntil(handleScheduled(env));
  },

  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    try {
      const url = new URL(request.url);

      if (url.pathname === '/trigger') {
        await handleScheduled(env);
        return new Response('Triggered successfully', { status: 200 });
      }

      if (url.pathname === '/health') {
        return new Response(
          JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      if (url.pathname === '/webhook' && request.method === 'POST') {
        const update = (await request.json()) as TelegramUpdate;
        const parsed = parseCommand(update);

        if (parsed?.command) {
          ctx.waitUntil(handleCommand(env, parsed.command, parsed.chatId));
        }

        return new Response('OK', { status: 200 });
      }

      return new Response('Not Found', { status: 404 });
    } catch (error) {
      console.error('Error in fetch handler:', error);
      return new Response('Internal Server Error', { status: 500 });
    }
  },
};
