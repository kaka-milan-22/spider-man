const assert = require('node:assert/strict');
const { test, afterEach, mock } = require('node:test');
require('./register-typescript.cjs');
const { easternTime, parseBlsCalendar, parseFedCalendar, parseEiaCalendar, fetchCalendar, formatCalendar, CALENDAR_SOURCES } = require('../src/calendar.ts');

afterEach(() => mock.restoreAll());
const start = Date.parse('2026-10-18T08:00:00Z');
const end = start + 30 * 86400000;
function blsEvent(summary, date, extra = '') {
  return `BEGIN:VEVENT\nDTSTART;TZID=US-Eastern:${date}\nSUMMARY:${summary}\n${extra}END:VEVENT\n`;
}
const bls = 'BEGIN:VCALENDAR\n' + blsEvent('Employment Situation', '20261106T083000')
  + blsEvent('Consumer Price Index', '20261110T083000')
  + blsEvent('Consumer Price Index', '20261210T083000') + 'END:VCALENDAR';
function fedMonth(month, date) { return `<div class="fomc-meeting__month"><strong>${month}</strong></div><div class="fomc-meeting__date">${date}</div>`; }
const fed = '<h4>2026 FOMC Meetings</h4>' + fedMonth('October', '27-28') + fedMonth('December', '8-9*')
  + '<h4>2027 FOMC Meetings</h4>' + fedMonth('January', '26-27');
const eia = '<p>The standard release time and day of the week will be at 10:30 a.m. eastern time on Wednesday with the following exceptions. All times are eastern.</p>'
  + '<table><tr><th>November 6, 2026</th><td>November 12, 2026</td><td>Thursday</td><td>12:00 p.m.</td><td>Veterans Day</td></tr></table>';

test('converts US Eastern with DST and UTC+8 date rollover', () => {
  assert.equal(new Date(easternTime(2026, 10, 28, 14, 0)).toISOString(), '2026-10-28T18:00:00.000Z');
  assert.equal(new Date(easternTime(2026, 11, 6, 8, 30)).toISOString(), '2026-11-06T13:30:00.000Z');
  assert.throws(() => easternTime(2026, 2, 30, 14, 0), /Invalid/);
});

test('BLS selects CPI and jobs, unfolds ICS lines and ignores cancelled releases', () => {
  const input = bls.replace('Employment Situation', 'Employment \n Situation')
    .replace('END:VCALENDAR', blsEvent('Consumer Price Index', '20261112T083000', 'STATUS:CANCELLED\n')
      + blsEvent('Producer Price Index', '20261113T083000') + 'END:VCALENDAR');
  const events = parseBlsCalendar(input, end);
  assert.equal(events.length, 3);
  assert.equal(events[0].time, Date.parse('2026-11-06T13:30:00Z'));
  assert.ok(events.every(e => e.title === 'CPI' || e.title.includes('非农')));
});

test('BLS fails closed for unknown timezone, invalid dates and expired calendars', () => {
  assert.throws(() => parseBlsCalendar(bls.replaceAll('US-Eastern', 'UTC+3'), end), /timezone/);
  assert.throws(() => parseBlsCalendar(bls.replace('20261106', '20260230'), end), /Invalid/);
  assert.throws(() => parseBlsCalendar(bls, Date.parse('2027-01-01')), /cover/);
  assert.throws(() => parseBlsCalendar('<html>Access Denied</html>', end), /Invalid/);
});

test('Fed uses final meeting date, handles cross-month dates and labels expected release time', () => {
  const events = parseFedCalendar(fed + fedMonth('Apr/May', '30-1'), start, end);
  assert.equal(events[0].time, Date.parse('2026-10-28T18:00:00Z'));
  assert.equal(events[1].time, Date.parse('2026-12-09T19:00:00Z'));
  assert.equal(events.at(-1).time, Date.parse('2027-05-01T18:00:00Z'));
  assert.ok(events.every(e => e.estimatedTime));
  assert.throws(() => parseFedCalendar('<html>new layout</html>', start, end), /cover/);
});

test('EIA replaces the regular Wednesday release with the holiday date/time', () => {
  const events = parseEiaCalendar(eia, start, end).filter(e => e.time >= start && e.time < end);
  assert.deepEqual(events.map(e => new Date(e.time).toISOString()), [
    '2026-10-21T14:30:00.000Z', '2026-10-28T14:30:00.000Z',
    '2026-11-04T15:30:00.000Z', '2026-11-12T17:00:00.000Z',
  ]);
  assert.throws(() => parseEiaCalendar(eia.replace('10:30 a.m.', '11:30 a.m.'), start, end), /changed/);
  assert.throws(() => parseEiaCalendar(eia, Date.parse('2027-01-01'), Date.parse('2027-02-01')), /cover/);
  assert.throws(() => parseEiaCalendar(eia.replace('12:00 p.m.', 'TBD'), start, end), /Invalid/);
});

test('calendar fetches all official sources anew, sorts/deduplicates and clearly labels unavailable sources', async () => {
  const requests = [];
  mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push({ url, options });
    return new Response(url === CALENDAR_SOURCES.BLS ? bls + '\n' + bls : url === CALENDAR_SOURCES.Fed ? fed : eia);
  });
  const result = await fetchCalendar(30, start);
  assert.equal(result.events.length, 7);
  assert.ok(result.sources.every(s => s.ok));
  const text = formatCalendar(result);
  assert.match(text, /2026-10-29 02:00.*FOMC/);
  assert.match(text, /2026-11-13 01:00.*EIA/);
  assert.match(text, /14:00 ET/);
  await fetchCalendar(7, start);
  assert.equal(requests.length, 6);
  assert.ok(requests.every(r => r.options.cache === 'no-store'));
  mock.restoreAll();
  mock.method(globalThis, 'fetch', async url => url === CALENDAR_SOURCES.EIA ? new Response(eia) : new Response('blocked', { status: 403 }));
  const partial = await fetchCalendar(7, start);
  assert.equal(partial.events.length, 1);
  assert.match(formatCalendar(partial), /BLS \/ Fed 暂不可用/);
  assert.equal(partial.sources[0].error, 'HTTP 403');
});

test('complete calendar outage never claims there are no events', async () => {
  mock.method(globalThis, 'fetch', async () => { throw new DOMException('timed out', 'TimeoutError'); });
  const result = await fetchCalendar(7, start);
  assert.equal(result.events.length, 0);
  assert.ok(result.sources.every(s => s.error === '请求超时'));
  assert.match(formatCalendar(result), /日程可能不完整/);
  assert.doesNotMatch(formatCalendar(result), /此期间暂无上述四类/);
  await assert.rejects(fetchCalendar(365, start), /7 or 30/);
});
