import { ProcessedStory, ArsArticle } from './types';

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

export function formatArsArticles(articles: ArsArticle[]): string {
  if (articles.length === 0) {
    return '📰 *Ars Technica Top 10*\n\nNo articles found.';
  }

  const header = '📰 *Ars Technica Top 10*\n\n';

  const articlesText = articles
    .map((article, index) => {
      const title = `${index + 1}. [${escapeMarkdown(article.title)}](${article.url})`;
      const excerpt = article.excerpt ? `\n   📝 ${escapeMarkdown(article.excerpt.substring(0, 150))}${article.excerpt.length > 150 ? '...' : ''}` : '';
      const date = article.publishedAt ? `\n   📅 ${formatArsDate(article.publishedAt)}` : '';
      return title + excerpt + date;
    })
    .join('\n\n');

  const message = header + articlesText;

  // Telegram message limit is 4096 characters
  if (message.length > 4000) {
    const truncated = articles.slice(0, 7);
    const truncatedText = truncated
      .map((article, index) => {
        const title = `${index + 1}. [${escapeMarkdown(article.title)}](${article.url})`;
        const excerpt = article.excerpt ? `\n   📝 ${escapeMarkdown(article.excerpt.substring(0, 100))}...` : '';
        return title + excerpt;
      })
      .join('\n\n');
    return header + truncatedText + '\n\n_(Message truncated. Showing top 7 stories.)_';
  }

  return message;
}

function formatArsDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return dateStr;
  }
}
