import { ProcessedStory } from './types';

export function formatStoryMessage(
  story: ProcessedStory,
  index: number
): string {
  const keywordsText = story.keywords.slice(0, 10).join(', ');

  return `${index}. [${escapeMarkdown(story.title)}](${story.url})
🏆 ${story.score} points | 💬 ${story.commentCount} comments
🏷️ ${escapeMarkdown(keywordsText)}`;
}

export function formatDailyDigest(
  stories: ProcessedStory[],
  date: Date
): string {
  if (stories.length === 0) {
    return '📰 *Hacker News Daily Digest*\n\nNo new top stories today.';
  }

  const sortedStories = [...stories].sort((a, b) => b.score - a.score);

  const dateStr = date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const header = `📰 *Hacker News Daily Digest*\n📅 ${escapeMarkdown(dateStr)}\n\n`;

  const storiesText = sortedStories
    .map((story, index) => formatStoryMessage(story, index + 1))
    .join('\n\n');

  const message = header + storiesText;

  if (message.length > 4000) {
    const truncatedStories = sortedStories.slice(0, 5);
    const truncatedText = truncatedStories
      .map((story, index) => formatStoryMessage(story, index + 1))
      .join('\n\n');
    return (
      header +
      truncatedText +
      '\n\n_(Message truncated due to length. Showing top 5 stories.)'
    );
  }

  return message;
}

export function formatStoriesRange(
  stories: ProcessedStory[],
  start: number,
  end: number
): string {
  if (stories.length === 0) {
    return `📰 *Hacker News Top ${start}-${end}*\n\nNo stories found.`;
  }

  const sortedStories = [...stories].sort((a, b) => b.score - a.score);

  const header = `📰 *Hacker News Top ${start}-${end}*\n\n`;

  const storiesText = sortedStories
    .map((story, index) => formatStoryMessage(story, start + index))
    .join('\n\n');

  const message = header + storiesText;

  if (message.length > 4000) {
    return (
      header +
      '_Message too long. Please try a smaller range._'
    );
  }

  return message;
}

function escapeMarkdown(text: string): string {
  return text
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/_/g, '\\_')
    .replace(/\*/g, '\\*')
    .replace(/`/g, '\\`');
}
