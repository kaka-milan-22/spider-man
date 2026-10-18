import { displayTime } from './display';

const DAY = 86400000;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
export const CALENDAR_SOURCES = {
  BLS: 'https://www.bls.gov/schedule/news_release/bls.ics',
  Fed: 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm',
  EIA: 'https://www.eia.gov/petroleum/supply/weekly/schedule.php',
} as const;
type Source = keyof typeof CALENDAR_SOURCES;
const EASTERN_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});
export interface CalendarEvent { title: string; time: number; source: Source; estimatedTime?: boolean }
export interface CalendarResult {
  events: CalendarEvent[];
  sources: Array<{ source: Source; ok: boolean; error?: string }>;
  days: number;
  fetchedAt: number;
}

function utcDate(year: number, month: number, day: number, hour = 0, minute = 0): number {
  const value = Date.UTC(year, month - 1, day, hour, minute);
  const date = new Date(value);
  if (year < 2000 || month < 1 || month > 12 || day < 1 || hour < 0 || hour > 23 || minute < 0 || minute > 59
    || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error('Invalid calendar date');
  }
  return value;
}

// Let the IANA timezone database handle US DST, including UTC+8 date rollover.
export function easternTime(year: number, month: number, day: number, hour: number, minute: number): number {
  const local = utcDate(year, month, day, hour, minute);
  let guess = local;
  for (let i = 0; i < 3; i++) {
    const p = Object.fromEntries(EASTERN_FORMATTER.formatToParts(new Date(guess)).map(part => [part.type, part.value]));
    const rendered = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
    if (rendered === local) return guess;
    guess += local - rendered;
  }
  throw new Error('Unable to resolve calendar timezone');
}

export function parseBlsCalendar(ics: string, end: number): CalendarEvent[] {
  if (!ics.includes('BEGIN:VCALENDAR')) throw new Error('Invalid BLS calendar');
  const unfolded = ics.replace(/\r?\n[ \t]/g, '').replace(/\r/g, '');
  const events: CalendarEvent[] = [];
  for (const match of unfolded.matchAll(/BEGIN:VEVENT\n([\s\S]*?)END:VEVENT/g)) {
    const block = match[1];
    if (/^STATUS:CANCELLED\s*$/m.test(block)) continue;
    const summary = /^SUMMARY:(.+)$/m.exec(block)?.[1].trim();
    const title = summary === 'Consumer Price Index' ? 'CPI' : summary === 'Employment Situation' ? '非农 / Employment Situation' : null;
    if (!title) continue;
    const date = /^DTSTART(?:;TZID=([^:\n]+))?:(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?\s*$/m.exec(block);
    if (!date || Number(date[7]) !== 0) throw new Error('Invalid BLS release time');
    let time: number;
    if (date[8] && !date[1]) time = utcDate(+date[2], +date[3], +date[4], +date[5], +date[6]);
    else if (date[1] === 'US-Eastern' || date[1] === 'America/New_York') {
      time = easternTime(+date[2], +date[3], +date[4], +date[5], +date[6]);
    } else throw new Error('Unknown BLS timezone');
    events.push({ title, time, source: 'BLS' });
  }
  if (!events.length || Math.max(...events.map(event => event.time)) < end) {
    throw new Error('BLS calendar does not yet cover requested period');
  }
  return events;
}

function plain(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&ndash;|&mdash;|&#8211;|[–—]/g, '-').replace(/\s+/g, ' ').trim();
}

export function parseFedCalendar(html: string, start: number, end: number): CalendarEvent[] {
  const headings = [...html.matchAll(/(\d{4}) FOMC Meetings/g)];
  const events: CalendarEvent[] = [];
  const years = new Set<number>();
  for (let i = 0; i < headings.length; i++) {
    const year = Number(headings[i][1]);
    if (year < new Date(start).getUTCFullYear() - 1) continue;
    const section = html.slice(headings[i].index, headings[i + 1]?.index ?? html.length);
    let count = 0;
    const pattern = /<div\b[^>]*class="[^"]*fomc-meeting__month[^"\n]*"[^>]*>([\s\S]*?)<\/div>\s*<div\b[^>]*class="[^"]*fomc-meeting__date[^"\n]*"[^>]*>([\s\S]*?)<\/div>/g;
    for (const match of section.matchAll(pattern)) {
      const monthNames = plain(match[1]).split('/');
      const month = MONTHS.findIndex(name => name === monthNames.at(-1)
        || name.startsWith(monthNames.at(-1)!)) + 1;
      const dates = /^(\d{1,2})(?:-(\d{1,2}))?\*?$/.exec(plain(match[2]));
      // Exclude notation votes or other non-scheduled events with no standard release time.
      if (!month || !dates) continue;
      const date = Number(dates[2] || dates[1]);
      const eventYear = monthNames.length > 1 && month === 1 ? year + 1 : year;
      events.push({ title: 'FOMC 利率决议', time: easternTime(eventYear, month, date, 14, 0), source: 'Fed', estimatedTime: true });
      count++;
    }
    if (count) years.add(year);
  }
  if (!years.has(new Date(start).getUTCFullYear()) || !years.has(new Date(end - 1).getUTCFullYear())) {
    throw new Error('Fed calendar does not cover requested year');
  }
  return events;
}

function englishDate(text: string): number {
  const match = /^([A-Za-z]+) (\d{1,2}), (\d{4})$/.exec(text);
  if (!match) throw new Error('Invalid EIA date');
  return utcDate(+match[3], MONTHS.indexOf(match[1]) + 1, +match[2]);
}

export function parseEiaCalendar(html: string, start: number, end: number): CalendarEvent[] {
  if (!/standard release time and day of the week will be at 10:30 a\.m\. eastern time on Wednesday/i.test(plain(html))) {
    throw new Error('EIA standard schedule has changed');
  }
  const exceptions = new Map<number, number>();
  const years = new Set<number>();
  for (const row of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...row[1].matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)].map(cell => plain(cell[1]));
    if (cells.length !== 5 || !/^[A-Za-z]+ \d{1,2}, \d{4}$/.test(cells[0])) continue;
    const weekEnding = englishDate(cells[0]);
    if (new Date(weekEnding).getUTCDay() !== 5) throw new Error('Unexpected EIA week ending');
    const release = new Date(englishDate(cells[1]));
    const clock = /^(\d{1,2}):(\d{2}) ([ap])\.m\.$/i.exec(cells[3]);
    if (!clock || +clock[1] < 1 || +clock[1] > 12) throw new Error('Invalid EIA release time');
    const hour = +clock[1] % 12 + (clock[3].toLowerCase() === 'p' ? 12 : 0);
    exceptions.set(weekEnding, easternTime(release.getUTCFullYear(), release.getUTCMonth() + 1, release.getUTCDate(), hour, +clock[2]));
    years.add(new Date(weekEnding).getUTCFullYear());
  }
  if (!years.has(new Date(start).getUTCFullYear()) || !years.has(new Date(end - 1).getUTCFullYear())) {
    throw new Error('EIA holiday schedule does not cover requested year');
  }
  const events: CalendarEvent[] = [];
  for (let date = Math.floor(start / DAY) * DAY - 14 * DAY; date < end; date += DAY) {
    if (new Date(date).getUTCDay() !== 5) continue;
    const normal = new Date(date + 5 * DAY);
    const time = exceptions.get(date) ?? easternTime(normal.getUTCFullYear(), normal.getUTCMonth() + 1, normal.getUTCDate(), 10, 30);
    events.push({ title: 'EIA 原油库存', time, source: 'EIA' });
  }
  return events;
}

export async function fetchCalendar(days = 7, now = Date.now()): Promise<CalendarResult> {
  if (days !== 7 && days !== 30) throw new Error('Calendar supports 7 or 30 days');
  const end = now + days * DAY;
  const results = await Promise.all((Object.entries(CALENDAR_SOURCES) as Array<[Source, string]>).map(async ([source, url]) => {
    try {
      const options: RequestInit & { cache: 'no-store' } = {
        cache: 'no-store', signal: AbortSignal.timeout(8000),
        headers: { 'Cache-Control': 'no-cache, no-store', 'User-Agent': 'spider-man-telegram-bot/1.0' },
      };
      const response = await fetch(url, options);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      const events = source === 'BLS' ? parseBlsCalendar(text, end)
        : source === 'Fed' ? parseFedCalendar(text, now, end) : parseEiaCalendar(text, now, end);
      return { source, ok: true, events };
    } catch (error) {
      console.warn(`Calendar source unavailable: ${source}`);
      const message = error instanceof Error ? error.message : '';
      const reason = /^HTTP \d{3}$/.test(message) ? message
        : /cover requested/.test(message) ? '日程尚未覆盖查询期间'
        : error instanceof Error && /timeout|abort/i.test(error.name) ? '请求超时' : '获取或解析失败';
      return { source, ok: false, error: reason, events: [] as CalendarEvent[] };
    }
  }));
  const events = [...new Map(results.flatMap(result => result.events)
    .filter(event => event.time >= now && event.time < end)
    .map(event => [`${event.source}:${event.title}:${event.time}`, event])).values()].sort((a, b) => a.time - b.time);
  return { events, sources: results.map(({ source, ok, error }) => ({ source, ok, ...(error ? { error } : {}) })), days, fetchedAt: now };
}

export function formatCalendar(result: CalendarResult): string {
  const lines = [`<b>📅 未来 ${result.days} 天 · UTC+8</b>`, ''];
  for (const event of result.events) lines.push(`<code>${displayTime(event.time)}</code> ${event.title}${event.estimatedTime ? ' *' : ''}`);
  const failed = result.sources.filter(source => !source.ok).map(source => source.source);
  if (!result.events.length) lines.push(failed.length ? '可用数据源中暂无事件，日程可能不完整。' : '此期间暂无上述四类已公布事件。');
  if (failed.length) lines.push('', `⚠️ ${failed.join(' / ')} 暂不可用或日程未覆盖该期间`);
  if (result.events.some(event => event.estimatedTime)) lines.push('', '* FOMC 按通常 14:00 ET 发布时刻换算，以临时公告为准');
  lines.push('', `查询：${displayTime(result.fetchedAt)} UTC+8`,
    '<a href="https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm">Fed</a> · <a href="https://www.bls.gov/schedule/">BLS</a> · <a href="https://www.eia.gov/petroleum/supply/weekly/schedule.php">EIA</a>',
    '/calendar 30 查看未来 30 天');
  return lines.join('\n');
}
