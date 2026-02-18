import { HNStory, HNAPIError } from './types';

const HN_API_BASE = 'https://hacker-news.firebaseio.com/v0';

export async function getTopStoryIds(limit: number): Promise<number[]> {
  try {
    const response = await fetch(`${HN_API_BASE}/topstories.json`);

    if (!response.ok) {
      throw new HNAPIError(
        `Failed to fetch top stories: ${response.status} ${response.statusText}`
      );
    }

    const storyIds = (await response.json()) as number[];
    return storyIds.slice(0, limit);
  } catch (error) {
    if (error instanceof HNAPIError) {
      throw error;
    }
    throw new HNAPIError(
      'Failed to fetch top story IDs',
      error instanceof Error ? error : undefined
    );
  }
}

export async function getStory(id: number): Promise<HNStory | null> {
  try {
    const response = await fetch(`${HN_API_BASE}/item/${id}.json`);

    if (!response.ok) {
      console.warn(`Failed to fetch story ${id}: ${response.status}`);
      return null;
    }

    const story = (await response.json()) as HNStory;

    if (!story || story.type !== 'story' || !story.url || !story.title) {
      return null;
    }

    return story;
  } catch (error) {
    console.warn(`Error fetching story ${id}:`, error);
    return null;
  }
}

export async function getTopStories(limit: number): Promise<HNStory[]> {
  const storyIds = await getTopStoryIds(limit * 2);

  const stories: HNStory[] = [];

  for (const id of storyIds) {
    if (stories.length >= limit) {
      break;
    }

    const story = await getStory(id);
    if (story && story.score > 0) {
      stories.push(story);
    }
  }

  return stories;
}
