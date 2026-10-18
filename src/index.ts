import { Env, ProcessedStory, HNStory, TelegramUpdate } from './types';
import { getConfig } from './config';
import { getStoriesByRange } from './hn-api';
import { fetchCryptoPrices, formatCryptoPrices } from './crypto';
import { fetchStockPrices, formatStockPrices } from './stocks';
import { fetchOilPrices, formatOilPrices } from './oil';
import { fetchMarketOverview, formatMarketOverview } from './market';
import { fetchCalendar, formatCalendar } from './calendar';
import { observe, availability, quoteAvailability, formatStatus } from './monitoring';
import { escapeHtml } from './display';
import {
  sendDigest,
  sendStoriesRange,
  parseCommand,
  isFlushCacheCommand,
  isCryptoCommand,
  isExRateCommand,
  isEthCommand,
  sendMessage,
  getGroupOwnerId,
  getWebhookStatus,
} from './telegram';
import { hasValidWebhookSecret, isAllowedGroup } from './access';
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
const HN_CACHE_TTL = 7200; // 120 minutes

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
  const processedStories = await observe(env.HN_STORIES, 'hn', () => fetchTopHNStories(env.HN_STORIES),
    stories => ({ ok: stories.length > 0, detail: `${stories.length} 条结果（可能来自缓存）` }));
  console.log(`Fetched ${processedStories.length} stories`);
  await observe(env.HN_STORIES, 'telegram', () => sendDigest(config.telegramBotToken, config.telegramChatId, processedStories, new Date()));
  console.log('Digest sent successfully');
}

async function handleCommand(
  env: Env,
  command: string,
  chatId: number,
  chatType: string,
  userId?: number,
  args = ''
): Promise<void> {
  const config = getConfig(env);
  if (!isAllowedGroup(chatId, chatType, config.telegramChatId)) return;
  const reply = (text: string, options: { disableLinkPreview?: boolean } = {}) =>
    observe(env.HN_STORIES, 'telegram', () => sendMessage(config.telegramBotToken, String(chatId), text, options));

  try {
    if (isFlushCacheCommand(command) || command === '/status') {
      // Silently ignore unauthorized attempts; do not advertise this hidden command.
      if (userId === undefined) return;
      let ownerId: number;
      try {
        ownerId = await getGroupOwnerId(config.telegramBotToken, config.telegramChatId);
      } catch {
        console.warn('Group owner verification failed; cache was not touched');
        return;
      }
      if (userId !== ownerId) return;
      if (command === '/status') {
        const webhook = await getWebhookStatus(config.telegramBotToken).catch(() => null);
        await reply(await formatStatus(env.HN_STORIES, webhook), { disableLinkPreview: true });
        return;
      }
      console.log(`Processing flush cache command for chat ${chatId}`);
      const deleted = await flushCache(env.HN_STORIES);
      // Do not recreate a status key immediately after clearing every cache key.
      await sendMessage(config.telegramBotToken, String(chatId), `✅ 已清除 ${deleted} 条缓存记录`);
      console.log(`Flushed ${deleted} cache entries`);
      return;
    }

    if (isCryptoCommand(command)) {
      console.log(`Processing crypto command for chat ${chatId}`);
      const prices = await observe(env.HN_STORIES, 'crypto', fetchCryptoPrices,
        value => availability(value.length, 10));
      const message = formatCryptoPrices(prices);
      await reply(message);
      console.log(`Sent ${prices.length} crypto prices`);
      return;
    }

    if (command === '/stocks') {
      const prices = await observe(env.HN_STORIES, 'stocks', fetchStockPrices, quoteAvailability);
      await reply(formatStockPrices(prices));
      return;
    }

    if (command === '/market') {
      const prices = await observe(env.HN_STORIES, 'market', fetchMarketOverview, quoteAvailability);
      await reply(formatMarketOverview(prices));
      return;
    }

    if (command === '/calendar') {
      if (args && args !== '7' && args !== '30') {
        await reply('用法：<code>/calendar</code> 或 <code>/calendar 30</code>');
        return;
      }
      const calendar = await observe(env.HN_STORIES, 'calendar', () => fetchCalendar(args === '30' ? 30 : 7),
        value => ({ ok: value.sources.every(source => source.ok),
          detail: value.sources.map(source => `${source.source} ${source.ok ? '正常' : source.error || '不可用'}`).join(' / ') }));
      await reply(formatCalendar(calendar), { disableLinkPreview: true });
      return;
    }

    if (command === '/oil') {
      const prices = await observe(env.HN_STORIES, 'oil', fetchOilPrices,
        value => ({ ok: value.international.every(quote => quote.price !== null) && value.philippines !== null,
          detail: `Yahoo ${value.international.filter(quote => quote.price !== null).length}/2；GasWatch ${value.philippines ? '可用' : '不可用'}` }));
      await reply(formatOilPrices(prices), {
        disableLinkPreview: true,
      });
      console.log(`Sent oil prices: ${prices.international.filter(quote => quote.price !== null).length}/2 international, Philippines ${prices.philippines ? 'available' : 'unavailable'}`);
      return;
    }

    if (isExRateCommand(command)) {
      console.log(`Processing /exrate command for chat ${chatId}`);
      if (!config.currencyApiKey) {
        await observe(env.HN_STORIES, 'exrate', async () => { throw new Error('Missing currency API key'); }).catch(() => {});
        await reply('❌ Currency API key not configured. Please contact the bot admin.');
        return;
      }
      const rates = await observe(env.HN_STORIES, 'exrate', () => fetchExchangeRates(config.currencyApiKey!, env.HN_STORIES),
        () => ({ ok: true, detail: '7 个币种可用（可能来自缓存）' }));
      const message = formatExchangeRates(rates);
      await reply(message);
      console.log(`Sent exchange rates`);
      return;
    }

    if (command === '/top10ars') {
      const articles = await observe(env.HN_STORIES, 'ars', () => getArsTopStories(env.HN_STORIES),
        value => ({ ok: value.length > 0, detail: `${value.length} 条结果（可能来自缓存）` }));
      const message = formatArsArticles(articles);
      await reply(message);
      console.log(`Sent ${articles.length} Ars Technica articles`);
      return;
    }

    if (command === '/top10hn') {
      console.log(`Processing /top10hn for chat ${chatId}`);
      const processedStories = await observe(env.HN_STORIES, 'hn', () => fetchTopHNStories(env.HN_STORIES),
        value => ({ ok: value.length > 0, detail: `${value.length} 条结果（可能来自缓存）` }));
      await observe(env.HN_STORIES, 'telegram', () => sendStoriesRange(config.telegramBotToken, String(chatId), processedStories, 1, 10));
      console.log(`Sent ${processedStories.length} stories`);
    }

    if (isEthCommand(command)) {
      console.log(`Processing /eth command for chat ${chatId}`);
      const message = await observe(env.HN_STORIES, 'eth', () => fetchAndFormatEthBrief(env.HN_STORIES),
        value => ({ ok: !value.startsWith('❌'), detail: 'ETH brief 返回结果（可能来自缓存）' }));
      await reply(message);
      console.log('Sent ETH brief');
      return;
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(`Error handling command ${command}:`, reason);
    const truncated = reason.length > 3800 ? reason.slice(0, 3800) + '…' : reason;
    try {
      await reply(`❌ <b>${escapeHtml(command)}</b> 执行失败\n<code>${escapeHtml(truncated)}</code>`);
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
        if (request.method !== 'POST') {
          return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'POST' } });
        }
        if (!await hasValidWebhookSecret(request, env.TELEGRAM_WEBHOOK_SECRET)) {
          return new Response('Forbidden', { status: 403 });
        }
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
        if (!await hasValidWebhookSecret(request, env.TELEGRAM_WEBHOOK_SECRET)) {
          return new Response('Forbidden', { status: 403 });
        }
        const update = (await request.json()) as TelegramUpdate;
        const parsed = parseCommand(update);

        if (parsed?.command) {
          ctx.waitUntil(handleCommand(env, parsed.command, parsed.chatId, parsed.chatType, parsed.userId, parsed.args));
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
