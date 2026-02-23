import { ArsArticle, ArsAPIError } from './types';

const ARS_RSS_URL = 'https://arstechnica.com/feed/';
const CACHE_KEY = 'ars:top10';
const CACHE_TTL = 7200; // 120 minutes

export async function getArsTopStories(kv: KVNamespace): Promise<ArsArticle[]> {
  try {
    const cached = await kv.get(CACHE_KEY, 'json');
    if (cached) {
      console.log('Cache hit for Ars Technica top stories');
      return cached as ArsArticle[];
    }

    
    console.log('Fetching Ars Technica RSS feed...');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    let response: Response;
    try {
      response = await fetch(ARS_RSS_URL, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; TelegramBot/1.0)',
        },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      throw new ArsAPIError(`Failed to fetch RSS: ${response.status} ${response.statusText}`);
    }

    const xmlText = await response.text();
    const articles = parseRSS(xmlText);

    
    if (articles.length > 0) {
      await kv.put(CACHE_KEY, JSON.stringify(articles), {
        expirationTtl: CACHE_TTL,
      });
      console.log(`Cached ${articles.length} Ars Technica articles`);
    }

    return articles;
  } catch (error) {
    console.error('Error fetching Ars Technica articles:', error);
    
    
    try {
      const cached = await kv.get(CACHE_KEY, 'json');
      if (cached) {
        console.log('Returning cached data after fetch error');
        return cached as ArsArticle[];
      }
    } catch (cacheError) {
      console.warn('Failed to read fallback cache:', cacheError);
    }
    
    return [];
  }
}

function parseRSS(xmlText: string): ArsArticle[] {
  const articles: ArsArticle[] = [];
  
  
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  
  while ((match = itemRegex.exec(xmlText)) !== null && articles.length < 10) {
    const itemContent = match[1];
    
    const title = extractTag(itemContent, 'title');
    const url = extractTag(itemContent, 'link');
    const excerpt = extractTag(itemContent, 'description');
    const publishedAt = extractTag(itemContent, 'pubDate');
    const author = extractTag(itemContent, 'dc:creator') || extractTag(itemContent, 'author') || 'Ars Technica';
    
    if (title && url) {
      articles.push({
        title: cleanText(title),
        url: cleanText(url),
        excerpt: cleanText(excerpt || '').substring(0, 200),
        publishedAt: cleanText(publishedAt || ''),
        author: cleanText(author),
      });
    }
  }
  
  return articles;
}

function extractTag(content: string, tagName: string): string | null {
  const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i');
  const match = content.match(regex);
  return match ? match[1].trim() : null;
}

function cleanText(text: string): string {
  let cleaned = text
    .replace(/<!\[CDATA\[/g, '')
    .replace(/\]\]>/g, '')
    .replace(/<[^>]+>/g, '')
    .trim();

  const entities: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&#039;': "'",
    '&apos;': "'",
    '&#x27;': "'",
    '&#x2F;': '/',
    '&#47;': '/',
  };

  for (const [entity, char] of Object.entries(entities)) {
    cleaned = cleaned.replace(new RegExp(entity, 'g'), char);
  }

  cleaned = cleaned.replace(/&#(\d+);/g, (_, code) => {
    return String.fromCharCode(parseInt(code, 10));
  });

  cleaned = cleaned.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
    return String.fromCharCode(parseInt(hex, 16));
  });

  return cleaned;
}
