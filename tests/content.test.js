import test from 'node:test';
import assert from 'node:assert/strict';
import { currentSeason, resolveSeason, safeURL, contactURL, dateValue, upcomingEvents, activeAnnouncements, youthURL, formatEvent } from '../public/js/content.js';

test('seasons switch at Massachusetts midnight, including year boundaries', () => {
  for (const [time, expected] of [
    ['2026-01-15T12:00:00Z', 'winter'], ['2026-04-15T12:00:00Z', 'spring'],
    ['2026-07-15T12:00:00Z', 'summer'], ['2026-10-05T12:00:00Z', 'fall'],
    ['2026-03-01T04:59:59Z', 'winter'], ['2026-03-01T05:00:00Z', 'spring'],
    ['2026-06-01T03:59:59Z', 'spring'], ['2026-06-01T04:00:00Z', 'summer'],
    ['2026-09-01T03:59:59Z', 'summer'], ['2026-09-01T04:00:00Z', 'fall'],
    ['2026-12-01T04:59:59Z', 'fall'], ['2026-12-01T05:00:00Z', 'winter']
  ]) assert.equal(currentSeason(new Date(time)), expected, time);
  assert.equal(resolveSeason('winter', new Date('2026-07-01T12:00Z')), 'winter');
  assert.equal(resolveSeason('unknown', new Date('2026-07-01T12:00Z')), 'summer');
});

test('publish windows and event endings exclude expired and malformed content', () => {
  const now = new Date('2026-10-05T16:00:00Z');
  const base = { published: true, title: 'Ward activity', startAt: '2026-10-05T12:00:00-04:00' };
  const items = [
    { ...base, title: 'Later', startAt: '2026-10-06T18:00:00-04:00' },
    { ...base, title: 'Ongoing', startAt: '2026-10-05T11:00:00-04:00', endAt: '2026-10-05T13:00:00-04:00' },
    { ...base, title: 'Expired', expiresAt: '2026-10-05T16:00:00Z' },
    { ...base, title: 'Draft', published: false },
    { ...base, title: 'Hidden', publishAt: '2026-10-06T00:00:00Z' },
    { ...base, title: 'Wrong order', endAt: '2026-10-05T10:00:00-04:00' },
    { ...base, title: 'Local device date', startAt: '2026-10-05T13:00' },
    { ...base, title: 'Bad expiry', expiresAt: 'invalid' }, null
  ];
  assert.deepEqual(upcomingEvents(items, now).map(x => x.title), ['Ongoing', 'Later']);
  assert.deepEqual(upcomingEvents(null, now), []);
});

test('pinned announcements sort first and publication/expiry are enforced', () => {
  const now = new Date('2026-10-05T16:00:00Z');
  const items = [
    { title: 'Newest', published: true, publishAt: '2026-10-05T12:00:00Z' },
    { title: 'Pinned', published: true, pinned: true, publishAt: '2026-10-01T12:00:00Z' },
    { title: 'Expired', published: true, expiresAt: now.toISOString() },
    { title: 'Future', published: true, publishAt: '2026-10-06T12:00:00Z' },
    { title: 'Invalid window', published: true, publishAt: 'invalid' },
    { title: 'Not published', published: 'true' }
  ];
  assert.deepEqual(activeAnnouncements(items, now).map(x => x.title), ['Pinned', 'Newest']);
});

test('links reject executable, insecure, credential-bearing and malformed values', () => {
  for (const value of ['javascript:alert(1)', 'data:text/html,test', 'http://example.com', '//example.com', 'https://user:pass@example.com', '', null]) assert.equal(safeURL(value), null);
  assert.equal(safeURL('https://youth.blackstoneward.org'), 'https://youth.blackstoneward.org/');
  assert.equal(contactURL({ email: 'ward@example.org' }), 'mailto:ward@example.org');
  assert.equal(contactURL({ email: 'ward@example.org?bcc=someone@example.org' }), null);
  assert.equal(contactURL({ email: 'ward@example.org\nBcc:test' }), null);
  assert.equal(contactURL(null), null);
});

test('youth destinations switch after migration without a homepage self-loop', () => {
  const youth = { ready: false, currentUrl: 'https://blackstoneward.org/', futureUrl: 'https://youth.blackstoneward.org/' };
  assert.equal(youthURL(youth, 'https://test.blackstoneward.org/'), youth.currentUrl);
  assert.equal(youthURL(youth, 'https://blackstoneward.org/?preview=1'), null);
  assert.equal(youthURL({ ...youth, ready: true }, 'https://blackstoneward.org/'), youth.futureUrl);
});

test('event badges use Eastern date, not the device zone', () => {
  const result = formatEvent('2026-10-06T00:30:00Z');
  assert.equal(result.month, 'Oct');
  assert.equal(result.day, '5');
  assert.match(result.full, /Oct 5/);
  for (const value of ['2026-02-30T12:00:00Z', '2026-10-05T24:00:00Z', '2026-10-05', 'not a date']) assert.equal(dateValue(value), null);
});

test('date-only events display no invented time and remain visible through their Eastern event day', () => {
  const event = { title: 'Youth Fireside', published: true, allDay: true, startAt: '2026-10-14T00:00:00-04:00', endAt: '2026-10-14T23:59:59-04:00' };
  assert.equal(formatEvent(event.startAt, false).full, 'Wed, Oct 14, 2026');
  assert.match(formatEvent(event.startAt).full, /12:00/);
  assert.equal(upcomingEvents([event], new Date('2026-10-15T03:59:00Z')).length, 1);
  assert.equal(upcomingEvents([event], new Date('2026-10-15T04:00:00Z')).length, 0);
});
