export const TIME_ZONE = 'America/New_York';
export const SEASONS = ['fall', 'winter', 'spring', 'summer'];

export function currentSeason(date = new Date()) {
  const month = Number(new Intl.DateTimeFormat('en-US', { month: 'numeric', timeZone: TIME_ZONE }).format(date));
  return month === 12 || month <= 2 ? 'winter' : month <= 5 ? 'spring' : month <= 8 ? 'summer' : 'fall';
}

export function resolveSeason(choice, date = new Date()) {
  return SEASONS.includes(choice) ? choice : currentSeason(date);
}

export function safeURL(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export function contactURL(contact = {}) {
  if (!contact || typeof contact !== 'object') return null;
  const url = safeURL(contact.url);
  if (url) return url;
  // Only one email address is accepted; no mailto query or newline injection.
  const email = typeof contact.email === 'string' ? contact.email.trim() : '';
  return /^[A-Za-z0-9.!#$%&'*+/=^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email)
    ? `mailto:${email}` : null;
}

export function dateValue(value) {
  // An explicit offset keeps published dates consistent on devices in other zones.
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  const [hour, minute, second = 0] = value.slice(11).split(/[Z+-]/)[0].split(':').map(Number);
  if (hour > 23 || minute > 59 || second >= 60) return null;
  const dayCheck = new Date(Date.UTC(year, month - 1, day));
  if (dayCheck.getUTCFullYear() !== year || dayCheck.getUTCMonth() !== month - 1 || dayCheck.getUTCDate() !== day) return null;
  const result = Date.parse(value);
  return Number.isFinite(result) ? result : null;
}

function published(item, now) {
  if (!item || item.published !== true || typeof item.title !== 'string' || !item.title.trim()) return false;
  const from = item.publishAt == null || item.publishAt === '' ? null : dateValue(item.publishAt);
  const until = item.expiresAt == null || item.expiresAt === '' ? null : dateValue(item.expiresAt);
  if (item.publishAt && from === null || item.expiresAt && until === null) return false;
  return (from === null || from <= now) && (until === null || until > now);
}

export function upcomingEvents(items, date = new Date()) {
  const now = date.getTime();
  return (Array.isArray(items) ? items : [])
    .filter(item => {
      if (!published(item, now)) return false;
      const start = dateValue(item.startAt);
      const end = item.endAt ? dateValue(item.endAt) : start;
      return start !== null && end !== null && end >= start && end >= now;
    })
    .sort((a, b) => dateValue(a.startAt) - dateValue(b.startAt));
}

export function activeAnnouncements(items, date = new Date()) {
  const now = date.getTime();
  return (Array.isArray(items) ? items : [])
    .filter(item => published(item, now))
    .sort((a, b) => Number(b.pinned === true) - Number(a.pinned === true)
      || (dateValue(b.publishAt) ?? 0) - (dateValue(a.publishAt) ?? 0));
}

export function youthURL(youth = {}, currentAddress = '') {
  const destination = safeURL(youth.ready === true ? youth.futureUrl : youth.currentUrl);
  if (!destination) return null;
  // A root launch must not accidentally link back to itself before migration.
  try {
    const page = new URL(currentAddress);
    const target = new URL(destination);
    if (page.origin === target.origin && page.pathname.replace(/\/$/, '') === target.pathname.replace(/\/$/, '')) return null;
  } catch { /* No current address is needed by non-browser consumers. */ }
  return destination;
}

export function formatEvent(value, includeTime = true) {
  const time = dateValue(value);
  if (time === null) return null;
  const date = new Date(time);
  return {
    month: new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, month: 'short' }).format(date),
    day: new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, day: 'numeric' }).format(date),
    full: new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', ...(includeTime ? { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' } : {}) }).format(date)
  };
}
