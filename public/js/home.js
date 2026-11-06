import { currentSeason, resolveSeason, safeURL, contactURL, upcomingEvents, activeAnnouncements, youthURL, formatEvent } from './content.js?v=1.2.44';
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
      badge.textContent = link.dataset.org === 'bishopric' ? 'Bishopric Hub' : 'Visit page';
      badge.className = 'badge open';
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
    const date = formatEvent(item.startAt, item.allDay !== true, item.endAt);
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

function parseSingleTimeToken(token, fallbackMeridiem = '') {
  if (!token || typeof token !== 'string') return null;
  const match = token.trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?(?::\d{2})?\s*(am|pm)?$/);
  if (!match) return null;
  let [, hStr, mStr = '00', meridiem] = match;
  let hour = parseInt(hStr, 10);
  const minute = parseInt(mStr, 10);
  if (hour > 23 || minute > 59) return null;
  const mer = meridiem || fallbackMeridiem;
  if (mer === 'pm' && hour < 12) hour += 12;
  if (mer === 'am' && hour === 12) hour = 0;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
}

function parseEventTimes(rawTime = '', startTimeField = '', endTimeField = '') {
  let start24 = parseSingleTimeToken(startTimeField);
  let end24 = parseSingleTimeToken(endTimeField);
  if (start24) return { start24, end24 };
  if (!rawTime || typeof rawTime !== 'string') return { start24: null, end24: null };
  const cleaned = rawTime.trim();
  const parts = cleaned.split(/\s*(?:[-–—]|\bto\b)\s*/i).filter(Boolean);
  if (parts.length >= 2) {
    const endMatch = parts[1].trim().toLowerCase().match(/(am|pm)$/);
    const fallbackMeridiem = endMatch ? endMatch[1] : '';
    start24 = parseSingleTimeToken(parts[0], fallbackMeridiem);
    end24 = parseSingleTimeToken(parts[1]);
    if (start24 && end24 && start24 > end24 && !/(am|pm)$/i.test(parts[0].trim()) && fallbackMeridiem === 'pm') {
      start24 = parseSingleTimeToken(parts[0], 'am');
    }
    return { start24, end24 };
  }
  start24 = parseSingleTimeToken(cleaned);
  return { start24, end24: null };
}

function getEasternOffset(dateStr) {
  try {
    const probe = new Date(`${dateStr}T12:00:00Z`);
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', timeZoneName: 'longOffset' }).formatToParts(probe);
    const tz = parts.find(p => p.type === 'timeZoneName')?.value || '';
    const match = tz.match(/GMT([+-]\d{2}:\d{2})/);
    if (match) return match[1];
  } catch { /* fallback below */ }
  return '-05:00';
}

function updateFirestoreEvents(docs) {
  if (!config) return;
  const list = docs.map(d => {
    const dateStr = typeof d.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.date.trim())
      ? d.date.trim()
      : (typeof d.startAt === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d.startAt) ? d.startAt.slice(0, 10) : '');
    const { start24: parsedStart, end24: parsedEnd } = parseEventTimes(d.time, d.startTime, d.endTime);
    const startAtTime = typeof d.startAt === 'string' && d.startAt.length >= 19 ? d.startAt.slice(11, 19) : '';
    const fallbackStart = d.allDay !== true && startAtTime && startAtTime !== '00:00:00' ? startAtTime : null;
    const start24 = parsedStart || fallbackStart;
    const isAllDay = d.allDay === true || !start24;
    const offset = dateStr ? getEasternOffset(dateStr) : '-05:00';
    const startAt = dateStr ? `${dateStr}T${isAllDay ? '00:00:00' : start24}${offset}` : (d.startAt || null);
    const endAt = dateStr ? `${dateStr}T${!isAllDay && parsedEnd ? parsedEnd : '23:59:59'}${offset}` : (d.endAt || null);
    return {
      title: (d.title || d.name || '').trim(),
      published: d.published !== false,
      startAt,
      endAt,
      location: (d.location || '').trim(),
      details: (d.details || d.body || '').trim(),
      url: d.url || null,
      linkLabel: d.linkLabel || null,
      allDay: isAllDay
    };
  }).filter(e => e.title && e.startAt);
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
  config.announcements = list;
  renderContent();
}

async function initLiveContent() {
  try {
    const savedAnn = localStorage.getItem('local_ward_announcements');
    if (savedAnn) {
      const parsed = JSON.parse(savedAnn);
      if (Array.isArray(parsed) && parsed.length > 0) {
        updateFirestoreAnnouncements(parsed);
      }
    }
  } catch { /* ignore localStorage errors */ }

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

    onSnapshot(collection(db, 'home_announcements'), snapshot => {
      const items = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        if (data && (data.org === 'Ward' || (typeof data.title === 'string' && data.title.trim()))) {
          items.push(data);
        }
      });
      updateFirestoreAnnouncements(items);
    }, () => { });

    onSnapshot(collection(db, 'ward_announcements'), snapshot => {
      const items = [];
      snapshot.forEach(docSnap => items.push(docSnap.data()));
      if (items.length > 0) updateFirestoreAnnouncements(items);
    }, () => { });

    onSnapshot(collection(db, 'ward_leaders'), snapshot => {
      const leaders = [];
      snapshot.forEach(docSnap => leaders.push({ id: docSnap.id, ...docSnap.data() }));
      wardLeadersPool = leaders;
    }, () => { });
  } catch {
    // If offline or modular import fails, static ward.json is already loaded.
  }
}

const BISHOPRIC_ROSTER = [
  { id: 'duane_harris', name: 'Duane Harris', shortName: 'Bishop Harris', lastName: 'Harris', role: 'Bishop', email: 'tueini@gmail.com' },
  { id: 'john_truscott', name: 'John Truscott', shortName: 'John Truscott', lastName: 'Truscott', role: '1st Counselor', email: '' },
  { id: 'garrett_bourne', name: 'Garrett Bourne', shortName: 'Garrett Bourne', lastName: 'Bourne', role: '2nd Counselor', email: '' },
  { id: 'cole_houston', name: 'Cole Houston', shortName: 'Cole Houston', lastName: 'Houston', role: 'Ward Clerk', email: '' },
  { id: 'brian_mcdonald', name: 'Brian McDonald', shortName: 'Brian McDonald', lastName: 'McDonald', role: 'Executive Secretary', email: 'mcdonaldlds830@gmail.com' }
];
const MASTER_APPROVED_HASHES = new Set([
  '103a9f4c69d7331576e1a7b7f96ce781e3336f7b304424373aea1f263c581a3d',
  '7ca8ae40ffb835bcc16f1de3fc4f27e3e6b3c709bc5d300f932cd019f86e488b',
  '4b465598d5fd124a3856acff035f025315f798faf08049ee57409e3045c72e37',
  '7f39e9e47d673293ede2907b955e989ab9188e35c39684c95eff536bb5b3e542'
]);
let wardLeadersPool = [];
let pendingBishopricDestination = 'https://bish.blackstoneward.org/';

function findBishopricMember(rawInput) {
  const cleaned = String(rawInput || '').trim().toLowerCase();
  if (!cleaned || cleaned.length < 2) return null;
  for (const member of BISHOPRIC_ROSTER) {
    if (
      member.name.toLowerCase() === cleaned ||
      member.lastName.toLowerCase() === cleaned ||
      member.shortName.toLowerCase() === cleaned ||
      cleaned.includes(member.lastName.toLowerCase())
    ) {
      return member;
    }
  }
  return null;
}

function readBishopricSSOCookie() {
  try {
    const match = document.cookie.match(/(?:^|;\s*)ward_auth_session=([^;]*)/);
    if (!match) return null;
    const parsed = JSON.parse(decodeURIComponent(match[1]));
    return findBishopricMember(parsed?.displayName || parsed?.name || '');
  } catch {
    return null;
  }
}

function writeBishopricSSOCookie(memberObj) {
  try {
    const payload = encodeURIComponent(JSON.stringify({
      displayName: memberObj.name,
      name: memberObj.name,
      role: memberObj.role,
      email: memberObj.email || '',
      ts: Date.now()
    }));
    const isBwDomain = location.hostname.endsWith('blackstoneward.org');
    const domainPart = isBwDomain ? '; domain=.blackstoneward.org' : '';
    const securePart = location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `ward_auth_session=${payload}; path=/; max-age=43200; SameSite=Lax${domainPart}${securePart}`;
  } catch { /* ignore cookie write errors */ }
}

async function computeSha256(text) {
  const data = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function initBishopricLockGate() {
  const bishLink = document.querySelector('[data-org="bishopric"]');
  const dialog = document.getElementById('bishopric-lock-dialog');
  if (!bishLink || !dialog) return;

  const closeBtn = document.getElementById('bishopric-lock-close');
  const form = document.getElementById('bishopric-lock-form');
  const nameInput = document.getElementById('bishopric-member-name');
  const pwInput = document.getElementById('bishopric-password');
  const matchEl = document.getElementById('bishopric-member-match');
  const errorEl = document.getElementById('bishopric-lock-error');
  const submitBtn = document.getElementById('bishopric-unlock-submit');
  const passkeyBtn = document.getElementById('bishopric-passkey-btn');
  const passkeyHint = document.getElementById('bishopric-passkey-hint');

  bishLink.addEventListener('click', event => {
    const dest = safeURL(bishLink.getAttribute('href')) || 'https://bish.blackstoneward.org/';
    const activeMember = readBishopricSSOCookie();
    if (activeMember) {
      return;
    }
    event.preventDefault();
    pendingBishopricDestination = dest;
    if (errorEl) errorEl.hidden = true;
    if (passkeyHint) passkeyHint.hidden = true;
    if (pwInput) pwInput.value = '';
    dialog.showModal();
  });

  if (closeBtn) closeBtn.addEventListener('click', () => dialog.close());

  if (nameInput) {
    nameInput.addEventListener('input', () => {
      if (errorEl) errorEl.hidden = true;
      const matched = findBishopricMember(nameInput.value);
      if (matchEl) {
        if (matched) {
          matchEl.textContent = `Verified Bishopric Member: ${matched.name} (${matched.role})`;
          matchEl.hidden = false;
        } else {
          matchEl.hidden = true;
        }
      }
    });
  }

  if (form) {
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (errorEl) errorEl.hidden = true;
      const matched = findBishopricMember(nameInput?.value);
      if (!matched) {
        if (errorEl) {
          errorEl.textContent = 'Access is restricted to members of the Blackstone Ward Bishopric. Please enter your first and last name.';
          errorEl.hidden = false;
        }
        nameInput?.focus();
        return;
      }
      const rawPw = (pwInput?.value || '').trim();
      if (!rawPw) {
        if (errorEl) {
          errorEl.textContent = 'Please enter your personal or master password.';
          errorEl.hidden = false;
        }
        pwInput?.focus();
        return;
      }
      if (submitBtn) submitBtn.textContent = 'Verifying...';
      try {
        const rawHash = await computeSha256(rawPw);
        const lowerHash = await computeSha256(rawPw.toLowerCase());
        const leaderDoc = wardLeadersPool.find(l => {
          const dn = String(l.displayName || '').toLowerCase();
          return dn === matched.name.toLowerCase() || dn.includes(matched.lastName.toLowerCase());
        });
        const validMaster = MASTER_APPROVED_HASHES.has(rawHash) || MASTER_APPROVED_HASHES.has(lowerHash);
        const validPersonal = leaderDoc?.passwordHash && (leaderDoc.passwordHash === rawHash || leaderDoc.passwordHash === lowerHash);
        if (validMaster || validPersonal) {
          writeBishopricSSOCookie(matched);
          dialog.close();
          location.href = pendingBishopricDestination;
          return;
        }
        if (errorEl) {
          errorEl.textContent = 'Incorrect password. Please enter your personal leader password or the ward master password.';
          errorEl.hidden = false;
        }
      } catch {
        if (errorEl) {
          errorEl.textContent = 'Could not verify credentials. Please try again.';
          errorEl.hidden = false;
        }
      } finally {
        if (submitBtn) submitBtn.textContent = 'Verify & Enter Bishopric Hub →';
      }
    });
  }

  if (passkeyBtn) {
    passkeyBtn.addEventListener('click', async () => {
      if (passkeyHint) passkeyHint.hidden = true;
      if (!window.PublicKeyCredential) {
        if (passkeyHint) {
          passkeyHint.textContent = 'Touch ID / Face ID is not supported in this browser. Please enter your name and password below.';
          passkeyHint.hidden = false;
        }
        return;
      }
      const typedMember = findBishopricMember(nameInput?.value);
      let savedCred = null;
      try {
        const raw = localStorage.getItem('wardPasskeyRegistered');
        if (raw) savedCred = JSON.parse(raw);
      } catch { /* ignore */ }
      if (!savedCred) {
        try {
          const match = document.cookie.match(/(?:^|;\s*)ward_passkey_cred=([^;]*)/);
          if (match) savedCred = JSON.parse(decodeURIComponent(match[1]));
        } catch { /* ignore */ }
      }
      const targetMember = typedMember || findBishopricMember(savedCred?.profile?.displayName || '') || BISHOPRIC_ROSTER[0];
      const rpId = location.hostname.endsWith('blackstoneward.org') ? 'blackstoneward.org' : location.hostname;
      try {
        const challenge = new Uint8Array(32);
        crypto.getRandomValues(challenge);
        const publicKey = { challenge, timeout: 60000, userVerification: 'required', rpId };
        if (savedCred?.rawId && Array.isArray(savedCred.rawId)) {
          publicKey.allowCredentials = [{ id: new Uint8Array(savedCred.rawId), type: 'public-key', transports: ['internal', 'hybrid'] }];
        }
        const assertion = await navigator.credentials.get({ publicKey });
        if (assertion) {
          writeBishopricSSOCookie(targetMember);
          dialog.close();
          location.href = pendingBishopricDestination;
        }
      } catch (err) {
        if (err?.name !== 'AbortError' && passkeyHint) {
          passkeyHint.textContent = 'No passkey found on this device yet. Please enter your Bishopric name and password below.';
          passkeyHint.hidden = false;
        }
      }
    });
  }
}
initBishopricLockGate();

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
