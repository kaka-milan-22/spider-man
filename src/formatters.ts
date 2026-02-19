import { ProcessedStory, ArsArticle } from './types';

export function formatStoryMessage(
  story: ProcessedStory,
  index: number
): string {
  return `${index}. <a href="${story.url}">${escapeHtml(story.title)}</a>
🏆 ${story.score} points | 💬 ${story.commentCount} comments`;
}

export function formatDailyDigest(
  stories: ProcessedStory[],
  date: Date
): string {
  if (stories.length === 0) {
    return '📰 <b>Hacker News Daily Digest</b>\n\nNo new top stories today.';
  }

  // Keep HN's original ranking order (no re-sorting by score)
  const sortedStories = stories;

  const dateStr = date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const header = `📰 <b>Hacker News Daily Digest</b>\n📅 ${escapeHtml(dateStr)}\n\n`;

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
      '\n\n<i>(Message truncated due to length. Showing top 5 stories.)</i>'
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
    return `📰 <b>Hacker News Top ${start}-${end}</b>\n\nNo stories found.`;
  }

  // Keep HN's original ranking order (no re-sorting by score)
  const sortedStories = stories;

  const header = `📰 <b>Hacker News Top ${start}-${end}</b>\n\n`;

  const storiesText = sortedStories
    .map((story, index) => formatStoryMessage(story, start + index))
    .join('\n\n');

  const message = header + storiesText;

  if (message.length > 4000) {
    return (
      header +
      '<i>Message too long. Please try a smaller range.</i>'
    );
  }

  return message;
}

function escapeHtml(text: string): string {
  // Escape HTML special characters
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function formatArsArticles(articles: ArsArticle[]): string {
  if (articles.length === 0) {
    return '📰 <b>Ars Technica Top 10</b>\n\nNo articles found.';
  }

  const header = '📰 <b>Ars Technica Top 10</b>\n\n';

  const articlesText = articles
    .map((article, index) => {
      const title = `${index + 1}. <a href="${article.url}">${escapeHtml(article.title)}</a>`;
      const excerpt = article.excerpt ? `\n   📝 ${escapeHtml(article.excerpt.substring(0, 150))}${article.excerpt.length > 150 ? '...' : ''}` : '';
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
        const title = `${index + 1}. <a href="${article.url}">${escapeHtml(article.title)}</a>`;
        const excerpt = article.excerpt ? `\n   📝 ${escapeHtml(article.excerpt.substring(0, 100))}...` : '';
        return title + excerpt;
      })
      .join('\n\n');
    return header + truncatedText + '\n\n<i>(Message truncated. Showing top 7 stories.)</i>';
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
