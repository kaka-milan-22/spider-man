import { Env, ProcessedStory, HNStory, TelegramUpdate } from './types';
import { getConfig } from './config';
import { getTopStories, getStoriesByRange } from './hn-api';
import { extractKeywordsFromUrl, extractKeywords } from './keywords';
import { fetchCryptoPrices, formatCryptoPrices } from './crypto';
import {
  sendDigest,
  sendStoriesRange,
  parseCommand,
  getCommandRange,
  isFlushCacheCommand,
  isCryptoCommand,
  isExRateCommand,
  sendMessage,
} from './telegram';
import { getArsTopStories } from './ars-api';
import { formatArsArticles } from './formatters';
import { fetchExchangeRates, formatExchangeRates } from './exrate-api';

const ONE_DAY_IN_SECONDS = 60 * 60 * 24;
const SEVEN_DAYS_IN_SECONDS = ONE_DAY_IN_SECONDS * 7;
const TWO_HOURS_IN_SECONDS = 60 * 60 * 2;

async function wasStorySent(kv: KVNamespace, storyId: number): Promise<boolean> {
  try {
    const key = `story:${storyId}`;
    const value = await kv.get(key);
    return value !== null;
  } catch (error) {
    console.warn(`Error checking if story ${storyId} was sent:`, error);
    return false;
  }
}

async function markStoryAsSent(
  kv: KVNamespace,
  storyId: number
): Promise<void> {
  try {
    const key = `story:${storyId}`;
    await kv.put(key, 'sent', { expirationTtl: SEVEN_DAYS_IN_SECONDS });
  } catch (error) {
    console.warn(`Error marking story ${storyId} as sent:`, error);
  }
}

async function getCommandCache(
  kv: KVNamespace,
  command: string
): Promise<ProcessedStory[] | null> {
  try {
    const key = `cache:${command}`;
    const value = await kv.get(key, 'json');
    if (value) {
      console.log(`Cache hit for ${command}`);
      return value as ProcessedStory[];
    }
    return null;
  } catch (error) {
    console.warn(`Error getting cache for ${command}:`, error);
    return null;
  }
}

async function setCommandCache(
  kv: KVNamespace,
  command: string,
  stories: ProcessedStory[]
): Promise<void> {
  try {
    const key = `cache:${command}`;
    await kv.put(key, JSON.stringify(stories), {
      expirationTtl: TWO_HOURS_IN_SECONDS,
    });
    console.log(`Cached ${stories.length} stories for ${command}`);
  } catch (error) {
    console.warn(`Error setting cache for ${command}:`, error);
  }
}

async function flushCache(kv: KVNamespace): Promise<number> {
  let deleted = 0;
  let cursor: string | undefined;

  do {
    const list = await kv.list({ cursor });
    for (const key of list.keys) {
      await kv.delete(key.name);
      deleted++;
    }
    cursor = list.list_complete ? undefined : list.cursor;
  } while (cursor);

  return deleted;
}

async function processStory(
  story: HNStory,
  kv: KVNamespace
): Promise<ProcessedStory | null> {
  if (!story.url) {
    console.warn(`Story ${story.id} has no URL, skipping`);
    return null;
  }

  const alreadySent = await wasStorySent(kv, story.id);

  if (alreadySent) {
    console.log(`Story ${story.id} already sent, skipping`);
    return null;
  }

  console.log(`Processing story ${story.id}: ${story.title}`);

  const keywords = await extractKeywordsFromUrl(story.url, story.title, 10);

  await markStoryAsSent(kv, story.id);

  return {
    id: story.id,
    title: story.title,
    url: story.url,
    score: story.score,
    author: story.by,
    time: story.time,
    commentCount: story.descendants || 0,
    keywords: keywords,
  };
}

async function processStoryWithoutDedup(story: HNStory): Promise<ProcessedStory | null> {
  if (!story.url) {
    console.warn(`Story ${story.id} has no URL, skipping`);
    return null;
  }

  console.log(`Processing story ${story.id}: ${story.title}`);

  const keywords = extractKeywords(story.title, 10);

  return {
    id: story.id,
    title: story.title,
    url: story.url,
    score: story.score,
    author: story.by,
    time: story.time,
    commentCount: story.descendants || 0,
    keywords: keywords,
  };
}

async function handleScheduled(env: Env): Promise<void> {
  const startTime = Date.now();
  console.log('Starting HN Telegram Bot scheduled job');

  try {
    const config = getConfig(env);
    console.log(`Configuration loaded: fetching top ${config.hnTopN} stories`);

    const stories = await getTopStories(config.hnTopN);
    console.log(`Fetched ${stories.length} stories from HN API`);

    if (stories.length === 0) {
      console.log('No stories to process');
      return;
    }

    const processedStories: ProcessedStory[] = [];

    for (const story of stories) {
      try {
        const processed = await processStory(story, env.HN_STORIES);

        if (processed) {
          processedStories.push(processed);
        }
      } catch (error) {
        console.error(`Error processing story ${story.id}:`, error);
      }
    }

    console.log(`Processed ${processedStories.length} new stories`);

    if (processedStories.length > 0) {
      await sendDigest(
        config.telegramBotToken,
        config.telegramChatId,
        processedStories,
        new Date()
      );
      console.log('Digest sent successfully');
    } else {
      console.log('No new stories to send');
    }

    const duration = Date.now() - startTime;
    console.log(`Job completed in ${duration}ms`);
  } catch (error) {
    console.error('Error in scheduled job:', error);
    throw error;
  }
}

async function handleCommand(
  env: Env,
  command: string,
  chatId: number
): Promise<void> {
  const config = getConfig(env);

  if (isFlushCacheCommand(command)) {
    console.log(`Processing flush cache command for chat ${chatId}`);
    const deleted = await flushCache(env.HN_STORIES);
    await sendMessage(
      config.telegramBotToken,
      String(chatId),
      `✅ 已清除 ${deleted} 条缓存记录`
    );
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

  // /exrate command handling
  if (isExRateCommand(command)) {
    // Per requirements, log and fetch/format exchange rates, then send
    console.log(`Processing /exrate command for chat ${chatId}`);
    
    if (!config.currencyApiKey) {
      await sendMessage(
        config.telegramBotToken,
        String(chatId),
        '❌ Currency API key not configured. Please contact the bot admin.'
      );
      console.log('Currency API key not configured');
      return;
    }
    
    const rates = await fetchExchangeRates(config.currencyApiKey);
    const message = formatExchangeRates(rates);
    await sendMessage(config.telegramBotToken, String(chatId), message);
    console.log(`Sent exchange rates`);
    return;
  }

  // Handle Ars Technica command
  if (command === '/top10ars') {
    const articles = await getArsTopStories(env.HN_STORIES);
    const message = formatArsArticles(articles);
    await sendMessage(config.telegramBotToken, String(chatId), message);
    console.log(`Sent ${articles.length} Ars Technica articles`);
    return;
  }

  const range = getCommandRange(command);

  if (!range) {
    return;
  }

  console.log(`Processing command: ${command} for chat ${chatId}`);

  const cachedStories = await getCommandCache(env.HN_STORIES, command);

  if (cachedStories) {
    await sendStoriesRange(
      config.telegramBotToken,
      String(chatId),
      cachedStories,
      range.start,
      range.end
    );
    console.log(`Sent ${cachedStories.length} cached stories for command ${command}`);
    return;
  }

  const stories = await getStoriesByRange(range.start, range.end);
  console.log(`Fetched ${stories.length} stories for range ${range.start}-${range.end}`);

  const processedStories: ProcessedStory[] = [];

  for (const story of stories) {
    try {
      const processed = await processStoryWithoutDedup(story);
      if (processed) {
        processedStories.push(processed);
      }
    } catch (error) {
      console.error(`Error processing story ${story.id}:`, error);
    }
  }

  if (processedStories.length > 0) {
    await setCommandCache(env.HN_STORIES, command, processedStories);
    await sendStoriesRange(
      config.telegramBotToken,
      String(chatId),
      processedStories,
      range.start,
      range.end
    );
    console.log(`Sent ${processedStories.length} stories for command ${command}`);
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
