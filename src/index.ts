import { Env, ProcessedStory, HNStory } from './types';
import { getConfig } from './config';
import { getTopStories } from './hn-api';
import { extractKeywordsFromUrl } from './keywords';
import { sendDigest } from './telegram';

const ONE_DAY_IN_SECONDS = 60 * 60 * 24;
const SEVEN_DAYS_IN_SECONDS = ONE_DAY_IN_SECONDS * 7;

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

      return new Response('Not Found', { status: 404 });
    } catch (error) {
      console.error('Error in fetch handler:', error);
      return new Response('Internal Server Error', { status: 500 });
    }
  },
};
