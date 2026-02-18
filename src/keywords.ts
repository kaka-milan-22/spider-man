import { KeywordExtractionError } from './types';

const STOP_WORDS = new Set([
  'the',
  'be',
  'to',
  'of',
  'and',
  'a',
  'in',
  'that',
  'have',
  'i',
  'it',
  'for',
  'not',
  'on',
  'with',
  'he',
  'as',
  'you',
  'do',
  'at',
  'this',
  'but',
  'his',
  'by',
  'from',
  'they',
  'we',
  'say',
  'her',
  'she',
  'or',
  'an',
  'will',
  'my',
  'one',
  'all',
  'would',
  'there',
  'their',
  'what',
  'so',
  'up',
  'out',
  'if',
  'about',
  'who',
  'get',
  'which',
  'go',
  'me',
  'when',
  'make',
  'can',
  'like',
  'time',
  'no',
  'just',
  'him',
  'know',
  'take',
  'people',
  'into',
  'year',
  'your',
  'good',
  'some',
  'could',
  'them',
  'see',
  'other',
  'than',
  'then',
  'now',
  'look',
  'only',
  'come',
  'its',
  'over',
  'think',
  'also',
  'back',
  'after',
  'use',
  'two',
  'how',
  'our',
  'work',
  'first',
  'well',
  'way',
  'even',
  'new',
  'want',
  'because',
  'any',
  'these',
  'give',
  'day',
  'most',
  'us',
  'is',
  'was',
  'are',
  'were',
  'been',
  'has',
  'had',
  'did',
  'does',
  'doing',
  'done',
  'above',
  'more',
  'thing',
  'things',
  'others',
  'something',
  'anything',
  'everything',
  'nothing',
  'someone',
  'anyone',
  'everyone',
  'nobody',
  'somewhere',
  'anywhere',
  'everywhere',
  'nowhere',
  'such',
  'own',
  'same',
  'very',
  'much',
  'many',
  'another',
  'each',
  'every',
  'both',
  'few',
  'little',
  'less',
  'across',
  'against',
  'along',
  'among',
  'around',
  'before',
  'behind',
  'below',
  'beneath',
  'beside',
  'between',
  'beyond',
  'during',
  'except',
  'inside',
  'near',
  'off',
  'onto',
  'outside',
  'through',
  'throughout',
  'toward',
  'towards',
  'under',
  'underneath',
  'until',
  'upon',
  'within',
  'without',
  'via',
  'per',
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length >= 3);
}

function filterStopWords(words: string[]): string[] {
  return words.filter((word) => !STOP_WORDS.has(word));
}

function countFrequency(words: string[]): Map<string, number> {
  const frequency = new Map<string, number>();

  for (const word of words) {
    frequency.set(word, (frequency.get(word) || 0) + 1);
  }

  return frequency;
}

function getTopKeywords(
  frequency: Map<string, number>,
  count: number
): string[] {
  const sorted = Array.from(frequency.entries()).sort((a, b) => b[1] - a[1]);

  return sorted.slice(0, count).map(([word]) => word);
}

export function extractKeywords(text: string, count: number): string[] {
  try {
    if (!text || text.trim().length === 0) {
      return [];
    }

    const tokens = tokenize(text);
    const filtered = filterStopWords(tokens);

    if (filtered.length === 0) {
      return [];
    }

    const frequency = countFrequency(filtered);
    return getTopKeywords(frequency, count);
  } catch (error) {
    throw new KeywordExtractionError(
      'Failed to extract keywords',
      error instanceof Error ? error : undefined
    );
  }
}

export async function extractKeywordsFromUrl(
  url: string,
  title: string,
  count: number
): Promise<string[]> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; HNTelegramBot/1.0)',
      },
    });

    if (!response.ok) {
      console.warn(`Failed to fetch article content: ${response.status}`);
      return extractKeywords(title, count);
    }

    const html = await response.text();

    const textContent = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const combinedText = `${title} ${textContent}`;
    const keywords = extractKeywords(combinedText, count);

    if (keywords.length < count) {
      const titleKeywords = extractKeywords(title, count);
      const uniqueKeywords = new Set([...keywords, ...titleKeywords]);
      return Array.from(uniqueKeywords).slice(0, count);
    }

    return keywords;
  } catch (error) {
    console.warn('Error fetching article content:', error);
    return extractKeywords(title, count);
  }
}
