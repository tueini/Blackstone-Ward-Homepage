import { currentSeason, resolveSeason, safeURL, contactURL, upcomingEvents, activeAnnouncements, youthURL, formatEvent } from './content.js?v=1.2.20';
document.body.classList.add('js-ready');

const seasonNames = { fall: 'Fall · Light beige', winter: 'Winter · Light blue', spring: 'Spring · Light green', summer: 'Summer · Light yellow' };
const colors = { fall: '#FAF6EF', winter: '#EEF5FC', spring: '#F1F7EC', summer: '#FFF9E7' };
const params = new URLSearchParams(location.search);
const reviewing = params.get('preview') === '1';
const buttons = [...document.querySelectorAll('[data-season-choice]')];
let seasonChoice = 'auto';
let config = null;
let expandedEvents = false;
let expandedAnnouncements = false;

function applySeason(choice) {
  seasonChoice = ['auto', 'fall', 'winter', 'spring', 'summer'].includes(choice) ? choice : 'auto';
  const season = resolveSeason(seasonChoice);
  document.body.dataset.season = season;
  document.querySelector('meta[name="theme-color"]').content = colors[season];
  document.querySelector('.season-status').textContent = seasonNames[season] + (seasonChoice === 'auto' ? ' · Automatic' : '');
  document.getElementById('footer-season').textContent = seasonNames[season].split(' · ')[0];
  buttons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.seasonChoice === seasonChoice)));
  requestFrame();
}
document.getElementById('season-preview').hidden = !reviewing;
buttons.forEach(button => button.addEventListener('click', () => applySeason(button.dataset.seasonChoice)));

const menu = document.querySelector('.menu-button');
const nav = document.getElementById('main-nav');
function closeMenu(returnFocus = false) {
  nav.classList.remove('open');
  menu.setAttribute('aria-expanded', 'false');
  if (returnFocus) menu.focus();
}
menu.addEventListener('click', () => menu.setAttribute('aria-expanded', String(nav.classList.toggle('open'))));
nav.addEventListener('click', event => { if (event.target.closest('a')) closeMenu(); });
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && nav.classList.contains('open')) closeMenu(true);
});
document.addEventListener('click', event => {
  if (!nav.contains(event.target) && !menu.contains(event.target)) closeMenu();
});

const scenes = [...document.querySelectorAll('.parallax')];
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const navLinks = [...document.querySelectorAll('.nav-link')];
const inPageNavLinks = navLinks.filter(link => (link.getAttribute('href') || '').startsWith('#'));
const anchors = inPageNavLinks.map(link => document.querySelector(link.getAttribute('href'))).filter(Boolean);
let frameQueued = false;
function renderFrame() {
  frameQueued = false;
  const speed = innerWidth <= 760 ? 0.12 : 0.30;
  for (const scene of scenes) {
    const layer = scene.querySelector('.scene-image');
    if (reducedMotion.matches) { layer.style.transform = 'none'; continue; }
    const box = scene.getBoundingClientRect();
    if (box.bottom < -130 || box.top > innerHeight + 130) continue;
    const offset = Math.max(-115, Math.min(115, (innerHeight / 2 - box.top - box.height / 2) * speed));
    layer.style.transform = `translate3d(0, ${offset.toFixed(2)}px, 0)`;
  }
  let current = anchors[0];
  for (const anchor of anchors) if (anchor && anchor.getBoundingClientRect().top < 160) current = anchor;
  inPageNavLinks.forEach(link => {
    const active = current && link.getAttribute('href') === '#' + current.id;
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'location'); else link.removeAttribute('aria-current');
  });
}
function requestFrame() {
  if (!frameQueued) { frameQueued = true; requestAnimationFrame(renderFrame); }
}
addEventListener('scroll', requestFrame, { passive: true });
addEventListener('resize', () => { if (innerWidth > 760) closeMenu(); requestFrame(); }, { passive: true });
reducedMotion.addEventListener('change', requestFrame);
applySeason(reviewing ? params.get('season') || 'auto' : 'auto');

function setText(id, value) { document.getElementById(id).textContent = value; }
function textValue(value) { return typeof value === 'string' ? value.trim() : ''; }
function configureSite(data) {
  const ward = textValue(data.wardName) || 'Blackstone Ward';
  setText('footer-identity', [ward, textValue(data.stakeName)].filter(Boolean).join(' • '));
  setText('footer-version', `v${data.version}`);
  const time = textValue(data.worship?.time);
  const address = textValue(data.worship?.address);
  setText('worship-time', [time, address].filter(Boolean).join(' • '));
  const meetinghouse = textValue(data.worship?.meetinghouseName);
  const visitAddress = [address, textValue(data.worship?.postalCode)].filter(Boolean).join(' ');
  setText('visit-details', [meetinghouse, visitAddress].filter(Boolean).join(' • '));
  document.getElementById('visit-details').hidden = !meetinghouse && !visitAddress;
  renderWeeklySchedule(data.worship?.weeklySchedule);
  const contact = contactURL(data.contact);
  const action = document.getElementById('contact-action');
  action.hidden = !contact;
  if (contact) action.href = contact;
  const youth = youthURL(data.youth, location.href);
  document.querySelectorAll('[data-youth-link]').forEach(link => {
    if (youth) { link.href = youth; link.removeAttribute('aria-disabled'); }
    else { link.removeAttribute('href'); link.setAttribute('aria-disabled', 'true'); }
  });
  document.querySelectorAll('[data-org]').forEach(link => {
    const org = data.organizations?.[link.dataset.org];
    const destination = org?.ready === true ? safeURL(org.url) : null;
    const badge = link.querySelector('.badge');
    if (destination) {
      link.href = destination;
      link.removeAttribute('aria-disabled');
      badge.textContent = 'Visit page'; badge.className = 'badge open';
    } else {
      link.removeAttribute('href'); link.setAttribute('aria-disabled', 'true');
      badge.textContent = 'Coming soon'; badge.className = 'badge soon';
    }
  });
  applySeason(reviewing ? params.get('season') || 'auto' : data.season || 'auto');
}

function element(tag, className, copy = '') {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = copy;
  return node;
}
function renderWeeklySchedule(rows) {
  if (!Array.isArray(rows)) return;
  const schedule = document.getElementById('weekly-schedule');
  schedule.replaceChildren();
  for (const item of rows) {
    const name = textValue(item?.name);
    const when = textValue(item?.when);
    if (!name || !when) continue;
    const row = element('tr', '');
    const label = element('th', '', name);
    label.scope = 'row';
    const details = element('td', '');
    for (const part of when.split(/(\d+(?:st|nd|rd|th))/g)) {
      const ordinal = /^(\d+)(st|nd|rd|th)$/.exec(part);
      if (ordinal) details.append(ordinal[1], element('sup', '', ordinal[2]));
      else details.append(part);
    }
    row.append(label, details);
    schedule.append(row);
  }
  document.getElementById('weekly-services').hidden = !schedule.children.length;
}
function addDetails(parent, item) {
  const body = textValue(item.details || item.body);
  if (body) parent.append(element('p', 'entry-details', body));
  const href = safeURL(item.url);
  if (href) {
    const link = element('a', 'text-link', textValue(item.linkLabel) || 'Learn more →');
    link.href = href;
    parent.append(link);
  }
}
function renderEvents(events) {
  const holder = document.getElementById('events-list');
  holder.replaceChildren();
  if (!events.length) {
    const empty = element('div', 'empty-state');
    empty.append(element('h3', '', 'No upcoming events posted.'), element('p', '', 'Check back for dates and details from ward leaders.'));
    holder.append(empty);
  }
  for (const item of events.slice(0, expandedEvents ? undefined : 3)) {
    const date = formatEvent(item.startAt, item.allDay !== true);
    const row = element('article', 'event-entry');
    const dateBadge = element('div', 'date-badge');
    dateBadge.setAttribute('aria-hidden', 'true');
    dateBadge.append(element('span', 'date-month', date.month), element('span', 'date-day', date.day));
    const copy = element('div', 'entry-copy');
    const time = element('time', 'entry-meta', date.full);
    time.dateTime = item.startAt;
    copy.append(element('h3', '', item.title.trim()), time);
    if (textValue(item.location)) copy.append(element('p', 'entry-meta', item.location.trim()));
    addDetails(copy, item);
    row.append(dateBadge, copy); holder.append(row);
  }
  const button = document.getElementById('events-more');
  button.hidden = events.length <= 3;
  button.textContent = expandedEvents ? 'Show fewer events ↑' : 'Show all upcoming events →';
  button.setAttribute('aria-expanded', String(expandedEvents));
  button.setAttribute('aria-controls', 'events-list');
}
function renderAnnouncements(items) {
  const holder = document.getElementById('announcements-list');
  holder.replaceChildren();
  if (!items.length) {
    const empty = element('div', 'empty-state warm');
    empty.append(element('h3', '', 'You’re up to date.'), element('p', '', 'New ward announcements will appear here.'));
    holder.append(empty);
  }
  for (const item of items.slice(0, expandedAnnouncements ? undefined : 2)) {
    const row = element('article', 'announcement-entry');
    if (item.pinned === true) row.append(element('span', 'eyebrow', 'Featured'));
    row.append(element('h3', '', item.title.trim()));
    addDetails(row, item);
    holder.append(row);
  }
  const button = document.getElementById('announcements-more');
  button.hidden = items.length <= 2;
  button.textContent = expandedAnnouncements ? 'Show fewer announcements ↑' : 'Show all announcements →';
  button.setAttribute('aria-expanded', String(expandedAnnouncements));
  button.setAttribute('aria-controls', 'announcements-list');
}
function renderContent() {
  if (!config) return;
  renderEvents(upcomingEvents(config.events));
  renderAnnouncements(activeAnnouncements(config.announcements));
  requestFrame();
}
document.getElementById('events-more').addEventListener('click', () => { expandedEvents = !expandedEvents; renderContent(); });
document.getElementById('announcements-more').addEventListener('click', () => { expandedAnnouncements = !expandedAnnouncements; renderContent(); });

function formatTimeTo24(timeStr) {
  if (!timeStr) return '00:00:00';
  const match = timeStr.trim().toLowerCase().match(/^(\d{1,2}):(\d{2})(?:\s*(am|pm))?$/);
  if (!match) return '00:00:00';
  let [, h, m, meridiem] = match;
  let hour = parseInt(h, 10);
  if (meridiem === 'pm' && hour < 12) hour += 12;
  if (meridiem === 'am' && hour === 12) hour = 0;
  return `${String(hour).padStart(2, '0')}:${m}:00`;
}

function updateFirestoreEvents(docs) {
  if (!config) return;
  const list = docs.map(d => ({
    title: (d.title || d.name || '').trim(),
    published: d.published !== false,
    startAt: d.startAt || (d.date ? `${d.date}T${d.time ? formatTimeTo24(d.time) : '00:00:00'}-04:00` : null),
    endAt: d.endAt || null,
    location: (d.location || '').trim(),
    details: (d.details || d.body || '').trim(),
    url: d.url || null,
    linkLabel: d.linkLabel || null,
    allDay: d.allDay === true
  })).filter(e => e.title && e.startAt);
  if (list.length > 0) {
    config.events = list;
    renderContent();
  }
}

function updateFirestoreAnnouncements(docs) {
  if (!config) return;
  const list = docs.map(d => ({
    title: (d.title || '').trim(),
    published: d.published !== false,
    body: (d.body || d.details || '').trim(),
    url: d.url || null,
    linkLabel: d.linkLabel || null,
    pinned: d.pinned === true,
    publishAt: d.publishAt || null,
    expiresAt: d.expiresAt || null
  })).filter(a => a.title);
  if (list.length > 0) {
    config.announcements = list;
    renderContent();
  }
}

async function initLiveContent() {
  try {
    const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js');
    const { getFirestore, collection, onSnapshot } = await import('https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js');
    const firebaseConfig = {
      apiKey: 'AIzaSyDrWB07WNqObtjiZb_NntJQZ0dhHyLRBas',
      authDomain: 'blackstoneward-b861c.firebaseapp.com',
      projectId: 'blackstoneward-b861c',
      storageBucket: 'blackstoneward-b861c.firebasestorage.app'
    };
    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app);

    onSnapshot(collection(db, 'Ward_events'), snapshot => {
      const items = [];
      snapshot.forEach(docSnap => items.push(docSnap.data()));
      updateFirestoreEvents(items);
    }, () => { });

    onSnapshot(collection(db, 'ward_announcements'), snapshot => {
      const items = [];
      snapshot.forEach(docSnap => items.push(docSnap.data()));
      updateFirestoreAnnouncements(items);
    }, () => { });
  } catch {
    // If offline or modular import fails, static ward.json is already loaded.
  }
}

async function loadContent() {
  try {
    const response = await fetch(new URL('../data/ward.json', import.meta.url), { cache: 'no-cache' });
    if (!response.ok) throw new Error('Content unavailable');
    const data = await response.json();
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid content');
    config = data;
    configureSite(config);
    renderContent();
    document.getElementById('content-status').hidden = true;
    initLiveContent();
  } catch {
    document.getElementById('content-status').hidden = false;
    if (!config) {
      document.getElementById('events-list').replaceChildren(element('p', 'empty-state', 'Upcoming events are temporarily unavailable.'));
      document.getElementById('announcements-list').replaceChildren(element('p', 'empty-state warm', 'Ward announcements are temporarily unavailable.'));
    }
  }
}
loadContent();
// Update expiry/season boundaries on a page left open overnight. No Firestore writes.
setInterval(() => {
  if (seasonChoice === 'auto' && document.body.dataset.season !== currentSeason()) applySeason('auto');
  renderContent();
}, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) loadContent(); });
