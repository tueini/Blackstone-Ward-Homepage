import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
  getFirestore,
  collection,
  getDocs,
  getDoc,
  setDoc,
  doc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  runTransaction,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import {
  getAuth,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  signInWithCustomToken,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { enrollCloudPasskey, loginWithCloudPasskey, loginWithLeaderPassword, setLeaderPassword, PASSKEY_SIGNIN_REQUIRED_MSG } from "../js/passkey-client.js?v=1.2.95";
// v1.2.58: seats, labels, orgs and areas come from the vendored BW_Platform permissions module (generated from the
// master sheet, copied in with a checksum check). Do not hand-edit public/js/permissions/.
import * as Access from "../js/permissions/access.js?v=1.2.95";
import {
  catalogFromPermissions,
  catalogFromFirestoreDocs,
  isFirestoreCatalogValid,
  buildCallingOptionList,
  callingDefinitionsFromCatalog,
  isV6Calling,
  v6RcForCalling,
  matrixRowsFromCatalog,
  buildRoleDocFields,
  recomputeGroups,
  rcSeq
} from "../js/permissions/calling-dropdown.js?v=1.2.95";

const firebaseConfig = {
  apiKey: "AIzaSyDrWB07WNqObtjiZb_NntJQZ0dhHyLRBas",
  authDomain: "blackstoneward-b861c.firebaseapp.com",
  projectId: "blackstoneward-b861c",
  storageBucket: "blackstoneward-b861c.firebasestorage.app",
  messagingSenderId: "609425206588",
  appId: "1:609425206588:web:99ae3cb602c82e212dc239",
  measurementId: "G-0T68YN4Y2P"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// State
let eventsCache = [];
let announcementsCache = [];
let spotlightsCache = [];
let leadersCache = [];
let currentLeaderProfile = null;
let appConfirmationResult = null;
let resetConfirmationResult = null;
let resetRecaptchaVerifier = null;
let currentYear = new Date().getFullYear();

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

// Helper: safe string
function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

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

function format24To12(time24) {
  if (!time24) return '';
  const [hStr, mStr = '00'] = time24.split(':');
  const h = parseInt(hStr, 10);
  if (Number.isNaN(h)) return '';
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hr12 = h % 12 || 12;
  return `${hr12}:${mStr.padStart(2, '0')} ${ampm}`;
}

function formatTimeTo24(timeStr) {
  const { start24 } = parseEventTimes(timeStr);
  return start24 || "00:00:00";
}

function getEasternOffset(dateStr) {
  try {
    const probe = new Date(`${dateStr}T12:00:00Z`);
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', timeZoneName: 'longOffset' }).formatToParts(probe);
    const tz = parts.find(p => p.type === 'timeZoneName')?.value || '';
    const match = tz.match(/GMT([+-]\d{2}:\d{2})/);
    if (match) return match[1];
  } catch (_) { }
  return '-05:00';
}

function getCategoryColor(cat) {
  const c = (cat || '').toLowerCase().trim();
  switch (c) {
    case 'bishopric': return 'bg-[#8B5CF6] text-white';
    case 'eq':
    case 'elders_quorum': return 'bg-[#3B82F6] text-white';
    case 'rs':
    case 'relief_society': return 'bg-[#EC4899] text-white';
    case 'ss':
    case 'sunday_school':
    case 'sunday': return 'bg-[#F59E0B] text-slate-900';
    case 'youth':
    case 'combined':
    case 'primary': return 'bg-[#10B981] text-white';
    default: return 'bg-[#007B91] text-white';
  }
}

// ================= ROLES & RBAC DEFINITIONS =================
const ROLE_DEFINITIONS = {
  admin: { label: "Web Administrator", org: "All Ward", fullAccess: true },
  bishopric: { label: "Bishopric", org: "All Ward", fullAccess: true },
  // v1.2.57: Home seats without the Youth admin areas (e.g. RC1 Web Admin only, Ward Clerk, Exec Sec).
  home_admin: { label: "Home Admin", org: "Ward", fullAccess: false },
  combined: { label: "Combined Youth Leader", org: "Youth", fullAccess: false },
  priests: { label: "Priests Quorum Leader", org: "Youth", fullAccess: false },
  teachers: { label: "Teachers Quorum Leader", org: "Youth", fullAccess: false },
  deacons: { label: "Deacons Quorum Leader", org: "Youth", fullAccess: false },
  young_women: { label: "Young Women Leader", org: "Youth", fullAccess: false },
  yw: { label: "Young Women Leader", org: "Youth", fullAccess: false },
  youth: { label: "Youth Leadership", org: "Youth", fullAccess: false },
  relief_society: { label: "Relief Society", org: "Relief Society", fullAccess: false },
  elders_quorum: { label: "Elders Quorum", org: "Elders Quorum", fullAccess: false },
  primary: { label: "Primary Leader", org: "Youth", fullAccess: false },
  sunday_school: { label: "Sunday School", org: "Sunday School", fullAccess: false },
  mission: { label: "Ward Mission", org: "Mission", fullAccess: false }
};

// ================= CALLING & ACCESS DEFINITIONS =================
// v1.2.66: built from the calling catalog (Firestore at runtime, or the vendored
// permissions.json fallback). Old Youth Hub names are retired from the dropdown.
let callingCatalog = catalogFromPermissions(Access.PERMISSIONS, Access.roleForAreas);
let CALLING_DEFINITIONS = callingDefinitionsFromCatalog(callingCatalog);

const CALLING_CATALOG_TIMEOUT_MS = 4000;
let callingCatalogLoadGen = 0;

function withCallingCatalogTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(Object.assign(new Error('timeout'), { code: 'timeout' })), ms);
    promise.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

function applyCallingCatalog(catalog) {
  callingCatalog = catalog;
  CALLING_DEFINITIONS = callingDefinitionsFromCatalog(catalog);
  if (catalog && Array.isArray(catalog.roles) && catalog.roles.length) {
    PERMISSIONS_ROLES = matrixRowsFromCatalog(catalog);
  }
}

async function fetchFirestoreCallingCatalog() {
  const metaSnap = await getDoc(doc(db, 'ward_permissions_meta', 'current'));
  if (!metaSnap.exists()) throw new Error('missing-meta');
  const rolesSnap = await getDocs(collection(db, 'ward_permissions_roles'));
  const meta = metaSnap.data();
  const roleDocs = rolesSnap.docs.map((d) => {
    const data = d.data() || {};
    return { id: d.id, ...data, rc: data.rc || d.id };
  });
  if (!isFirestoreCatalogValid(meta, roleDocs)) throw new Error('invalid');
  return catalogFromFirestoreDocs(meta, roleDocs);
}

async function loadCallingCatalog() {
  const gen = ++callingCatalogLoadGen;
  let sourceNote = 'bundled';
  try {
    const catalog = await withCallingCatalogTimeout(fetchFirestoreCallingCatalog(), CALLING_CATALOG_TIMEOUT_MS);
    if (gen !== callingCatalogLoadGen) return;
    applyCallingCatalog(catalog);
    sourceNote = 'firestore';
  } catch (err) {
    if (gen !== callingCatalogLoadGen) return;
    const code = err && (err.code || err.message);
    let reason = 'failed';
    if (code === 'permission-denied' || code === 'PERMISSION_DENIED') reason = 'denied';
    else if (code === 'timeout' || (err && err.message === 'timeout')) reason = 'timeout';
    else if (err && err.message === 'invalid') reason = 'invalid';
    else if (err && err.message === 'missing-meta') reason = 'missing';
    sourceNote = `bundled (${reason})`;
  }
  if (gen !== callingCatalogLoadGen) return;
  console.info(`Calling dropdown source: ${sourceNote}`);
  const select = document.getElementById('leader-calling');
  const current = select ? (select.value || select.dataset.originalCalling || '') : '';
  renderCallingOptions(current);
  renderAccessMatrixTable();
}

function renderCallingOptions(currentValue) {
  const select = document.getElementById('leader-calling');
  if (!select) return;
  const previous = currentValue !== undefined && currentValue !== null
    ? currentValue
    : (select.value || select.dataset.originalCalling || '');
  const list = buildCallingOptionList(callingCatalog);

  while (select.firstChild) select.removeChild(select.firstChild);

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Select a calling…';
  select.appendChild(placeholder);

  const retired = previous && !isV6Calling(callingCatalog, previous);
  if (retired) {
    const o = document.createElement('option');
    o.value = previous;
    o.textContent = `(retired: ${previous}) — pick a v6 calling`;
    o.disabled = true;
    select.appendChild(o);
    select.dataset.originalCalling = previous;
  } else if (select.dataset.originalCalling) {
    delete select.dataset.originalCalling;
  }

  for (const group of list.groups) {
    const og = document.createElement('optgroup');
    og.label = group.label;
    for (const opt of group.options) {
      const o = document.createElement('option');
      o.value = opt.value;
      o.textContent = opt.text;
      og.appendChild(o);
    }
    select.appendChild(og);
  }

  if (retired) {
    select.value = previous;
    if (select.value !== previous) {
      const retiredOpt = Array.from(select.options).find((o) => o.disabled && o.value === previous);
      if (retiredOpt) retiredOpt.selected = true;
    }
  } else if (previous && isV6Calling(callingCatalog, previous)) {
    select.value = previous;
  } else {
    select.value = '';
  }
}

const YOUTH_ADMIN_AREAS = [
  "Settings & Privacy",
  "Combined",
  "Priests",
  "Teachers",
  "Deacons",
  "Young Women",
  "Primary"
];

// v1.2.58: calling definition for a Home seat row of the permissions module (uses only the module, so it is safe
// while CALLING_DEFINITIONS is being built).
function homeSeatCallingDef(row, extra = {}) {
  const names = Object.entries(Access.PERMISSIONS.hubs.youth.areaNames).filter(([, id]) => row.areas.includes(id)).map(([n]) => n);
  return { calling: row.name, org: "bishopric", role: Access.resolveAccess({ rcCodes: [row.rc] }).role, activeOnYouth: names.length > 0, defaultAccess: names, ...extra };
}

function getCallingDef(callingName) {
  return CALLING_DEFINITIONS.find(c => c.calling === callingName) || null;
}

function getLeaderCalling(leader) {
  if (leader?.calling) return leader.calling;
  const r = (leader?.role || '').toLowerCase().trim();
  if (r === 'admin' || r === 'bishopric') return 'Bishopric';
  if (r === 'elders_quorum' || r === 'eq') return 'EQ Pres';
  if (r === 'relief_society' || r === 'rs') return 'RS Pres';
  if (r === 'sunday_school' || r === 'ss') return 'SS Pres';
  if (r === 'primary') return 'Youth Primary Pres';
  if (r === 'young_women' || r === 'yw') return 'Youth YW Pres';
  if (r === 'priests') return 'Youth Priest';
  if (r === 'teachers') return 'Youth Teacher';
  if (r === 'deacons') return 'Youth Deacon';
  if (r === 'combined' || r === 'youth') return 'Youth Priest';
  return 'Bishopric';
}

function getLeaderOrg(leader) {
  const calling = getLeaderCalling(leader);
  const def = getCallingDef(calling);
  if (def) return def.org;
  const r = (leader?.role || '').toLowerCase().trim();
  if (r === 'admin' || r === 'bishopric') return 'bishopric';
  if (['youth', 'combined', 'priests', 'teachers', 'deacons', 'young_women', 'yw', 'primary'].includes(r) || (calling && calling.startsWith('Youth'))) return 'youth';
  if (r === 'elders_quorum' || r === 'eq') return 'elders_quorum';
  if (r === 'relief_society' || r === 'rs') return 'relief_society';
  if (r === 'sunday_school' || r === 'ss') return 'sunday_school';
  return 'bishopric';
}

function getLeaderAccessAreas(leader) {
  // v1.2.57/1.2.58: Home seat holders get the Youth areas of their master-sheet rows, not saved checkboxes.
  const seatAreas = getHomeSeatAreas(leader);
  if (seatAreas) return youthAreaNamesFromIds(seatAreas);
  if (Array.isArray(leader?.accessAreas)) return leader.accessAreas;
  const calling = getLeaderCalling(leader);
  const def = getCallingDef(calling);
  return def ? [...def.defaultAccess] : [];
}

function resolveLeaderRole(leader) {
  if (!leader) return 'bishopric';
  const rawRole = (leader.role || '').toLowerCase().trim();
  const calling = getLeaderCalling(leader);
  const def = getCallingDef(calling);
  const areas = getLeaderAccessAreas(leader);

  // v1.2.57/1.2.58: Home seats (RC1-RC6, incl. the owner record and legacy 'Ward Administrator') and the
  // master-password session take their role from their areas (permissions module); RC1 Web Admin alone is not 'admin'.
  const seatRole = resolveSeatRole(leader);
  if (seatRole) return seatRole;

  // Preserve primary Ward Administrator
  if (
    leader.id === 'leader_duane_harris' ||
    normalizePhone(leader.phoneNumber || '') === '+15084940905' ||
    (rawRole === 'admin' && (!leader.calling || calling === 'Bishopric' || calling === 'Web Administrator' || calling === 'Ward Administrator'))
  ) {
    return 'admin';
  }

  // Full 7-area Youth Hub access or Bishopric calling maps to bishopric
  // v1.2.55: the six spreadsheet seats behave exactly like legacy "Bishopric"; RC1 Ward Administrator resolves to admin.
  // v1.2.56: RC1 'Web Administrator' (and its legacy name 'Ward Administrator') resolves to admin.
  const isBishopricSeat = calling === 'Bishopric' || Object.values(HOME_ADMIN_SEATS).includes(calling) || !!HOME_ADMIN_LEGACY_CALLINGS[calling];
  if (areas.length === 7 || isBishopricSeat) {
    return (rawRole === 'admin' || calling === 'Web Administrator' || calling === 'Ward Administrator') ? 'admin' : 'bishopric';
  }

  // Derive specific Youth Hub role from assigned accessAreas and calling so Youth Hub RBAC restricts tabs accurately
  const isYouthOrg = (def && def.org === 'youth') || leader.org === 'youth' ||
    ['youth', 'combined', 'priests', 'teachers', 'deacons', 'young_women', 'yw', 'primary'].includes(rawRole) ||
    areas.length > 0;

  if (isYouthOrg) {
    const specificAreas = areas.filter(a => a !== 'Combined' && a !== 'Settings & Privacy');
    if (specificAreas.length === 1) {
      const area = specificAreas[0];
      if (area === 'Young Women') return 'young_women';
      if (area === 'Priests') return 'priests';
      if (area === 'Teachers') return 'teachers';
      if (area === 'Deacons') return 'deacons';
      if (area === 'Primary') return 'primary';
    }
    if (areas.length === 1 && areas[0] === 'Combined') {
      return 'combined';
    }
    if (def && def.role) {
      return def.role;
    }
    if (['young_women', 'yw', 'priests', 'teachers', 'deacons', 'primary', 'combined'].includes(rawRole)) {
      return rawRole === 'yw' ? 'young_women' : rawRole;
    }
    if (areas.includes('Young Women')) return 'young_women';
    if (areas.includes('Priests')) return 'priests';
    if (areas.includes('Teachers')) return 'teachers';
    if (areas.includes('Deacons')) return 'deacons';
    if (areas.includes('Primary')) return 'primary';
    return 'combined';
  }

  if (def && def.role) return def.role;
  if (rawRole && rawRole !== 'youth') return rawRole;
  return 'bishopric';
}

function canUserAccessWardSettings(leader) {
  if (!leader) return false;
  const role = resolveLeaderRole(leader);
  if (role === 'admin' || role === 'bishopric') return true;
  const org = getLeaderOrg(leader);
  if (org === 'bishopric') return true;
  const areas = getLeaderAccessAreas(leader);
  return areas.includes('Settings & Privacy');
}

// ================= RBAC PERMISSIONS =================
// v1.2.60: record how this tab signed in. Add/edit/remove/onboard leaders
// requires a passkey session. SMS, personal-password, Google, and master-password
// sessions may view the list and may set passwords per D8, but cannot add or edit.
function setSignInMethod(method) {
  if (typeof sessionStorage === 'undefined') return;
  if (method) sessionStorage.setItem('wardAdminSignInMethod', method);
  else sessionStorage.removeItem('wardAdminSignInMethod');
}

function isPasskeySession() {
  return typeof sessionStorage !== 'undefined' && sessionStorage.getItem('wardAdminSignInMethod') === 'passkey';
}

function canUserChangePassword(targetLeader) {
  if (!targetLeader) return false;
  // v1.2.58 (D8, Duane 2026-11-21): the master-password session and the Bishop (RC2) edit every password;
  // RC3/RC4 edit their own and non-bishopric users' (no RC1-RC6 seat); everyone else only their own.
  return Access.canEditPassword(currentLeaderProfile, targetLeader, { owner: HOME_ADMIN_OWNER, actorBreakGlass: isBreakGlassProfile(currentLeaderProfile) });
}

function canUserEditLeader(targetLeader) {
  if (!targetLeader) return false;
  // v1.2.60: add/edit requires a passkey session (SMS / personal password / Google / master are view-only).
  if (!isPasskeySession()) return false;
  const currentRole = resolveLeaderRole(currentLeaderProfile);
  const targetRole = resolveLeaderRole(targetLeader);

  // 1. Ward Administrator can edit all leaders
  if (currentRole === 'admin') return true;

  // 2. Bishopric can add/edit all other users and Bishopric, but NOT Ward Administrator
  if (currentRole === 'bishopric') {
    return targetRole !== 'admin';
  }

  // v1.2.57: Home-only seats manage only leaders whose every area they hold themselves.
  if (currentRole === 'home_admin') return targetRole !== 'admin' && canGrantWithin(targetLeader);

  // 3. Other org users cannot edit leader profiles
  return false;
}

function canUserDeleteLeader(targetLeader) {
  if (!targetLeader) return false;
  // v1.2.60: remove requires a passkey session.
  if (!isPasskeySession()) return false;
  const currentRole = resolveLeaderRole(currentLeaderProfile);
  const targetRole = resolveLeaderRole(targetLeader);

  // 1. Ward Administrator can delete leaders (except primary admin Duane Harris)
  if (currentRole === 'admin') {
    return targetLeader.id !== 'leader_duane_harris' && targetLeader.phoneNumber !== '+15084940905';
  }

  // 2. Bishopric can remove other leaders and Bishopric, but NOT Ward Administrator
  if (currentRole === 'bishopric') {
    return targetRole !== 'admin';
  }

  // v1.2.57: Home-only seats manage only leaders whose every area they hold themselves.
  if (currentRole === 'home_admin') return targetRole !== 'admin' && canGrantWithin(targetLeader);

  // 3. Other org users cannot remove leaders
  return false;
}

function canUserAddLeader() {
  // v1.2.60: add requires a passkey session.
  if (!isPasskeySession()) return false;
  const currentRole = resolveLeaderRole(currentLeaderProfile);
  return currentRole === 'admin' || currentRole === 'bishopric' || currentRole === 'home_admin'; // v1.2.57: + home_admin (limited by area)
}

function canUserOnboardLeader(targetLeader) {
  if (!targetLeader) return false;
  // v1.2.60: onboard requires a passkey session.
  if (!isPasskeySession()) return false;
  const currentRole = resolveLeaderRole(currentLeaderProfile);
  const targetRole = resolveLeaderRole(targetLeader);

  // 1. Ward Administrator can onboard all leaders
  if (currentRole === 'admin') return true;

  // 2. Bishopric can onboard Bishopric and all other users, but NOT Ward Administrator
  if (currentRole === 'bishopric') {
    return targetRole !== 'admin';
  }

  // v1.2.57: Home-only seats manage only leaders whose every area they hold themselves.
  if (currentRole === 'home_admin') return targetRole !== 'admin' && canGrantWithin(targetLeader);

  // 3. Other org users cannot onboard leaders
  return false;
}

function normalizePhone(phoneStr) {
  if (!phoneStr) return '';
  const digits = phoneStr.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return phoneStr.startsWith('+') ? phoneStr : `+${digits}`;
}

// ================= CROSS-SUBDOMAIN SSO COOKIE BRIDGE =================
function getSSOCookieDomain() {
  const hostname = window.location.hostname;
  // If running on production blackstoneward.org or its subdomains (except test/staging), share across .blackstoneward.org
  if (hostname.endsWith('blackstoneward.org') && !hostname.startsWith('test.') && !hostname.includes('staging')) {
    return '.blackstoneward.org';
  }
  // Fall back to current hostname on localhost or staging
  return hostname;
}

function setSSOCookie(profile) {
  if (!profile) return;
  if (isBreakGlassProfile(profile)) return; // v1.2.58 (D4): master password = Home area 1 only, never a shared session
  try {
    const resolvedRole = resolveLeaderRole(profile);
    const resolvedCalling = getLeaderCalling(profile);
    const resolvedOrg = getLeaderOrg(profile);
    const resolvedAreas = getLeaderAccessAreas(profile);
    // v1.2.57: a Home seat holding none of the Bishopric/Youth areas (2, 3, 7-18), e.g. RC1 Web Admin only, gets no
    // shared session from Home (Youth turns any cookie into a sign-in), and a stale cookie of their own is cleared.
    const seatAreas = getHomeSeatAreas(profile);
    if (seatAreas && !seatAreas.some(a => SHARED_SESSION_AREA_IDS.includes(a))) {
      if (sharedCookieBelongsTo(profile)) clearSSOCookie();
      return;
    }
    const ssoPayload = {
      ...profile,
      name: profile.displayName || profile.name || 'Ward Leader',
      displayName: profile.displayName || profile.name || 'Ward Leader',
      uid: profile.phoneNumber || profile.email || profile.uid || profile.id || 'leader',
      role: resolvedRole,
      calling: resolvedCalling,
      org: resolvedOrg,
      accessAreas: resolvedAreas,
      authenticatedAt: profile.authenticatedAt || new Date().toISOString()
    };
    delete ssoPayload.passwordHash; // Protect credentials from cookie storage
    if (seatAreas) ssoPayload.areas = seatAreas; // v1.2.57: master-sheet area ids for hubs that read them
    const val = encodeURIComponent(JSON.stringify(ssoPayload));
    const domain = getSSOCookieDomain();
    const domainAttr = (domain === 'localhost' || domain === '127.0.0.1') ? '' : `; domain=${domain}`;
    const secureAttr = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `ward_auth_session=${val}; path=/; max-age=604800; SameSite=Lax${domainAttr}${secureAttr}`;
  } catch (err) {
    console.warn("SSO cookie set error:", err);
  }
}

// v1.2.57: true when the current ward_auth_session cookie names this same leader.
function sharedCookieBelongsTo(profile) {
  try {
    const match = document.cookie.match(/(?:^|;\s*)ward_auth_session=([^;]+)/);
    if (!match) return false;
    const c = JSON.parse(decodeURIComponent(match[1])) || {};
    const uid = profile.phoneNumber || profile.email || profile.uid || profile.id || '';
    const name = String(profile.displayName || profile.name || '').trim().toLowerCase();
    return (!!uid && c.uid === uid) || (!!name && String(c.displayName || c.name || '').trim().toLowerCase() === name);
  } catch (_) {
    return false;
  }
}

function clearSSOCookie() {
  try {
    const domain = getSSOCookieDomain();
    const domainAttr = (domain === 'localhost' || domain === '127.0.0.1') ? '' : `; domain=${domain}`;
    const secureAttr = window.location.protocol === 'https:' ? '; Secure' : '';
    // Clear cookie on configured domain
    document.cookie = `ward_auth_session=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT${domainAttr}${secureAttr}; SameSite=Lax`;
    // Explicitly clear across root .blackstoneward.org domain
    document.cookie = `ward_auth_session=; path=/; domain=.blackstoneward.org; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT${secureAttr}; SameSite=Lax`;
    // Also clear host-only cookie
    document.cookie = `ward_auth_session=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT${secureAttr}; SameSite=Lax`;
  } catch (err) {
    console.warn("SSO cookie clear error:", err);
  }
}

// ================= AUTHENTICATION =================
// v1.2.91 (Duane 2026-11-23, #3): the temporary master password (break-glass) is retired; its hash and check are removed.

// 2026-11-21 (Duane, v1.2.60): personal leader passwords (ward_leaders.passwordHash) are enabled.
// v1.2.91 (#2): they are checked and stored only on the server (passkeyApi /password/login and /password/set).
const PERSONAL_LEADER_PASSWORDS_DISABLED = false;

// v1.2.63: one message for SMS/password sign-in failures so a wrong name, phone, code, or password is not distinguished.
const GENERIC_SIGNIN_FAILED_MSG = "Sign-in failed. Please check your details and try again.";

// 2026-11-20 (Duane, v1.2.53): friendly messages for the CANDIDATE ward_leaders rules
// (BW_Platform/prod-rules/firestore.rules.candidate, NOT deployed). With the current open
// live rules these never trigger.
const LEADERS_EDIT_DENIED_MSG = "You don't have permission to edit leaders. Sign in with your passkey to make changes. Your change was not saved.";
const LEADERS_REMOVE_DENIED_MSG = "Leaders can't be deleted from here. To remove someone's access, edit the leader and turn off Active (passkey sign-in required). Nothing was removed.";
const LEADERS_LOAD_DENIED_MSG = "The leader list can't be shown with this sign-in. Sign in with your passkey, or with a text-message code if you hold a Home admin seat, to view leaders."; // v1.2.69
// v1.2.54 (Duane, 2026-11-21): shown if the leader list can't be read AFTER phone sign-in; the user is signed out.
const LEADERS_POSTAUTH_CHECK_FAILED_MSG = "Your phone was verified, but the leader list couldn't be checked, so you weren't signed in. Please try again or use your passkey.";
let leadersTableDenied = false;
let leadersPreAuthFailed = false; // pre-sign-in leader-list read failed (denied/unavailable): skip the SMS name pre-check
let leadersDeniedAlertAt = 0;
function isPermissionDenied(err) { return !!err && err.code === 'permission-denied'; }
// v1.2.69 (2026-11-22): Home content saves need a passkey or a text-message sign-in once the tightened rules are live.
const CONTENT_WRITE_DENIED_MSG = "Saved on this device only. Saving to the website needs a passkey (Touch ID) or text-message sign-in; master-password and personal-password sign-ins can't save site content.";
function alertContentWriteDenied(err) { if (isPermissionDenied(err)) alertLeadersDenied(CONTENT_WRITE_DENIED_MSG); }
// v1.2.69 (2026-11-22): tightened rules draft (BW_Platform prod-rules/firestore.rules.draft-20261122-tighten) let an
// SMS session read only ward_leaders records whose phoneNumber is its verified number, and treat it as a leader only
// after it binds leader_sessions/{uid}. Also works under the live rules (the bind is simply refused there).
function leaderPhoneVariants(e164) {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(String(e164 || ''));
  if (!m) return e164 ? [String(e164)] : [];
  const [, a, b, c] = m;
  const d = a + b + c;
  return [`+1${d}`, d, `1${d}`, `(${a}) ${b}-${c}`, `(${a})${b}-${c}`, `${a}-${b}-${c}`, `${a}.${b}.${c}`, `${a} ${b} ${c}`,
    `+1 ${a} ${b} ${c}`, `+1 (${a}) ${b}-${c}`, `+1-${a}-${b}-${c}`, `+1 ${a}-${b}-${c}`, `1-${a}-${b}-${c}`, `1 (${a}) ${b}-${c}`];
}
async function findLeadersByVerifiedPhone(e164) {
  if (!leaderPhoneVariants(e164).length) return [];
  const snap = await getDocs(query(collection(db, "ward_leaders"), where("phoneNumber", "in", leaderPhoneVariants(e164))));
  const list = [];
  snap.forEach(d => list.push({ id: d.id, ...d.data() }));
  return list;
}
async function bindLeaderSession(leaderId, hub) {
  const user = auth.currentUser;
  if (!user || !leaderId) return false;
  try {
    await setDoc(doc(db, "leader_sessions", user.uid), { leaderId: String(leaderId), boundAt: new Date().toISOString(), hub });
    return true;
  } catch (e) {
    console.info("leader_sessions bind not saved:", e && e.code ? e.code : e);
    return false;
  }
}
function alertLeadersDenied(msg) {
  const now = Date.now();
  if (now - leadersDeniedAlertAt < 3000) return;
  leadersDeniedAlertAt = now;
  alert(msg);
}
// v1.2.76 (Duane voice 11:40 PM ET): a denied full ward_leaders read (password, authenticator app or Google session)
// now opens one pop-up per denial instead of red table text. The table keeps a short neutral line so it never looks empty.
const LEADERS_DENIED_POPUP_MSG = "You have logged in successfully. In order to see the list of authorized users, you need to log out and log back in with your Touch ID that you've enabled."; // Duane's dictated wording, voice 11:41 PM ET
const LEADERS_DENIED_TABLE_MSG = "Leader list not shown for this sign-in.";
let leadersDeniedPopupShown = false;
function openLeadersDeniedModal() {
  if (leadersDeniedPopupShown) return;
  const modal = document.getElementById('leaders-denied-modal');
  if (!modal) { leadersDeniedPopupShown = true; alert(LEADERS_DENIED_POPUP_MSG); return; }
  const msg = document.getElementById('leaders-denied-msg');
  if (msg) msg.textContent = LEADERS_DENIED_POPUP_MSG;
  leadersDeniedPopupShown = true;
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function showLeadersLoadDenied() {
  const tbody = document.getElementById('leaders-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';
  const tr = document.createElement('tr');
  const td = document.createElement('td');
  td.colSpan = 8;
  td.className = 'px-4 py-6 text-center text-sm text-[#536484]';
  td.textContent = LEADERS_DENIED_TABLE_MSG; // v1.2.76: the pop-up carries the instructions
  tr.appendChild(td);
  tbody.appendChild(tr);
  openLeadersDeniedModal();
}

// v1.2.55 (Duane, 2026-11-21): Home /admin is limited to area 1 of Permissions-v3.xlsx (Roles tab, column E):
// exactly RC1-RC6. This is the single source for the Home sign-in gate (SMS, passkey, stored session).
// Calling strings are the spreadsheet "Roles & Callings" rows verbatim. A ward_leaders record qualifies by an
// `rcCodes` field (e.g. ["RC3"]) or by an exact calling below; Youth ignores both.
// v1.2.58: the Home gate seats = master-sheet rows holding the Home gate area (area 1: RC1-RC6), from the module.
const HOME_ADMIN_SEATS = Object.fromEntries(Access.PERMISSIONS.roles.filter(r => r.areas.includes(Access.PERMISSIONS.hubs.home.gateArea)).map(r => [r.rc, r.name]));
// v1.2.56 (Duane, 2026-11-21): RC1 was renamed in the sheet; records saved with the old calling still qualify.
// v1.2.58: legacy names come from the module (legacyNames), limited to gate seats.
const HOME_ADMIN_LEGACY_CALLINGS = Object.fromEntries(Object.entries(Access.PERMISSIONS.legacyNames).filter(([, rc]) => HOME_ADMIN_SEATS[rc]));
// Owner record holds RC2 + RC1 (seats confirmed by Duane 2026-11-20, BW_Platform seat manifest).
// v1.2.58 (D3, Duane 2026-11-21): these seats are only a backup, used when the owner record has no seats of its own
// (no rcCodes and no sheet calling); otherwise the owner record is read by its rcCodes like everyone else.
const HOME_ADMIN_OWNER = { id: "leader_duane_harris", phone: "+15084940905", seats: ["RC2", "RC1"] };
const HOME_ADMIN_DENIED_MSG = "Home admin is limited to the bishopric. Youth leaders can sign in at youth.blackstoneward.org/admin.";
function getHomeAdminSeats(leader) {
  if (!leader) return [];
  return Access.rcCodesFor(leader, { owner: HOME_ADMIN_OWNER }).filter(rc => HOME_ADMIN_SEATS[rc]);
}
function isHomeAdminAllowed(leader) {
  // v1.2.58: gate = the Home gate area (area 1 = RC1-RC6 seats, or the master-password break-glass session).
  return !!leader && leader.active !== false && Access.canEnterHub(accessOf(leader), 'home');
}
// Signs out of Firebase Auth on this site only and clears this tab's Home session. The shared
// ward_auth_session cookie is neither set nor cleared here, so Youth sessions are unaffected.
async function refuseHomeAdmin(errEl) {
  try { await signOut(auth); } catch (_) { }
  sessionStorage.removeItem('wardAdminAuth');
  sessionStorage.removeItem('wardLeaderProfile');
  sessionStorage.removeItem('wardAdminBreakGlass'); // v1.2.58
  sessionStorage.removeItem('wardAdminSignInMethod'); // v1.2.60
  if (errEl) {
    errEl.textContent = HOME_ADMIN_DENIED_MSG;
    errEl.classList.remove('hidden');
  } else {
    alert(HOME_ADMIN_DENIED_MSG);
  }
}

// v1.2.56: Access Matrix reference data. v1.2.58: no longer embedded here; it comes from the vendored permissions
// module (BW_Platform scripts/build-permissions.js from the master sheet; Current User column never included).
// Roles rows, in sheet order: [RC code, Roles & Callings, Calling Label, Org codes, restricted area ids].
let PERMISSIONS_ROLES = Access.PERMISSIONS.roles.map(r => [r.rc, r.name, r.label, r.orgText, [...r.areas]]);
const PERMISSIONS_ORGS = { ...Access.PERMISSIONS.orgs };
// Restricted Areas tab: id -> [Restricted Areas, Specific Regions in Restricted Areas, Status].
const PERMISSIONS_AREAS = Object.fromEntries(Access.PERMISSIONS.areas.map(a => [a.id, [a.site, a.region, a.status]]));
// v1.2.56: old full names (before the sheet renames) on saved records still map to their RC row.
const PERMISSIONS_LEGACY_NAMES = { ...Access.PERMISSIONS.legacyNames };
// v1.2.56: RC rows a leader holds, in sheet order: rcCodes (any sheet row), an exact full-name calling
// (current or legacy name) and the Home seats/owner record.
function getLeaderRcCodes(leader) {
  if (!leader) return [];
  // v1.2.58: module rcCodesFor (rcCodes + exact/legacy sheet calling; owner seats only as the D3 backup).
  return Access.rcCodesFor(leader, { owner: HOME_ADMIN_OWNER });
}
// v1.2.56: Authorized Users "Calling" text is bare (no RC prefix).
// v1.2.62: visible text is the sheet Roles & Callings name(s) (col B) from resolved seats
// (rcCodes or an exact/legacy calling match via Access.rcCodesFor). The stored calling
// string is shown only when there are no resolved seats.
function getLeaderCallingLabels(leader) {
  const rcs = getLeaderRcCodes(leader);
  if (!rcs.length) {
    const c = getLeaderCalling(leader);
    return { text: c, title: c };
  }
  const rows = rcs.map(rc => PERMISSIONS_ROLES.find(r => r[0] === rc)).filter(Boolean);
  const names = rows.map(r => r[1]);
  return { text: names.join(', '), title: names.join(', ') };
}
// ================= v1.2.57 AREA-BASED ACCESS (Duane, 2026-11-21 4:03 PM ET) =================
// v1.2.58: all area data and the role rule come from the vendored permissions module (no wildcards, D2).
const ALL_AREA_IDS = Access.PERMISSIONS.areas.map(a => a.id);
const YOUTH_ADMIN_AREA_IDS = [...Access.PERMISSIONS.hubs.youth.adminAreas];
// Youth Hub admin area names (YOUTH_ADMIN_AREAS) -> Restricted Areas ids.
const YOUTH_AREA_IDS_BY_NAME = { ...Access.PERMISSIONS.hubs.youth.areaNames };
// Areas served by the other hubs that read the shared ward_auth_session cookie (Bishopric hub 2-3, Youth admin 7-18).
const SHARED_SESSION_AREA_IDS = [...Access.PERMISSIONS.hubs.sharedSessionAreas];
// v1.2.58 (D4): the master-password session is a fixed break-glass profile (area 1 only), recognised by its id AND
// this tab's session flag, never by a field on a leader record.
const BREAK_GLASS_ID = "break_glass_master";
function isBreakGlassProfile(leader) {
  return !!leader && leader.id === BREAK_GLASS_ID && typeof sessionStorage !== 'undefined' && sessionStorage.getItem('wardAdminBreakGlass') === 'true';
}
function accessOf(leader) {
  return Access.resolveAccess(leader, { owner: HOME_ADMIN_OWNER, breakGlass: isBreakGlassProfile(leader) });
}
function getRcAreaUnion(rcs) {
  return Access.areasForRcCodes(rcs);
}
// Areas of a Home seat holder (null when the leader holds no RC1-RC6 seat: older calling/role logic applies).
function getHomeSeatAreas(leader) {
  if (!leader) return null;
  if (isBreakGlassProfile(leader)) return accessOf(leader).areas;
  if (!getHomeAdminSeats(leader).length) return null;
  return getRcAreaUnion(getLeaderRcCodes(leader));
}
function youthAreaNamesFromIds(ids) {
  return YOUTH_ADMIN_AREAS.filter(n => ids.includes(YOUTH_AREA_IDS_BY_NAME[n]));
}
// Role for a Home seat holder, from areas (module roleForAreas): every area -> admin (Bishop RC2, owner); the gate
// area + Youth admin areas 7-18 -> bishopric (RC3/RC4); otherwise 'home_admin' (RC1 alone, RC5, RC6, break-glass).
function resolveSeatRole(leader) {
  const areas = getHomeSeatAreas(leader);
  if (!areas) return null;
  return Access.roleForAreas(areas);
}
// Every area a leader record holds or would give (seat areas, else role and Youth checkboxes).
function getLeaderGrantedAreas(leader) {
  const seat = getHomeSeatAreas(leader);
  if (seat) return seat;
  const set = new Set(getRcAreaUnion(getLeaderRcCodes(leader)));
  const role = resolveLeaderRole(leader);
  if (role === 'admin' || role === 'bishopric') ALL_AREA_IDS.forEach(a => set.add(a));
  const roleArea = { combined: 7, priests: 8, teachers: 9, deacons: 10, young_women: 11, yw: 11, primary: 12, elders_quorum: 19, relief_society: 20, sunday_school: 21 }[role];
  if (roleArea) set.add(roleArea);
  getLeaderAccessAreas(leader).forEach(n => { const id = YOUTH_AREA_IDS_BY_NAME[n]; if (id) set.add(id); });
  return [...set].sort((a, b) => a - b);
}
// A 'home_admin' may manage a leader (or save a record) only when every area involved is one they hold.
function canGrantWithin(leader) {
  const mine = getLeaderGrantedAreas(currentLeaderProfile);
  return getLeaderGrantedAreas(leader).every(a => mine.includes(a));
}

function splitOrgCodes(s) {
  return String(s || '').split(',').map(c => c.trim()).filter(Boolean);
}
function renderOrgCodes(codes) {
  if (!codes || !codes.length) return '<span class="text-slate-300 font-mono">—</span>';
  return codes.map(c => `<span class="cursor-help" title="${escapeHtml(PERMISSIONS_ORGS[c] || c)}">${escapeHtml(c)}</span>`).join(', ');
}
// v1.2.62: Org column comes only from resolved seats (rcCodes or an exact/legacy calling
// match via Access.rcCodesFor / getLeaderRcCodes), union of each row's sheet Org codes
// in sheet order. No fallback to a stored org string (e.g. "bishopric" -> BI only), which
// hid YM for bishopric counselors who have not picked a seat yet.
function getLeaderOrgCodes(leader) {
  const rcs = getLeaderRcCodes(leader);
  if (!rcs.length) return [];
  const set = new Set();
  PERMISSIONS_ROLES.forEach(([rc, , , org]) => { if (rcs.includes(rc)) splitOrgCodes(org).forEach(c => set.add(c)); });
  return [...set];
}

// Org-code legend popover for the (i) buttons in the Organization headers (keyboard, Esc, click-outside, tap).
let orgLegendEl = null;
let orgLegendBtn = null;
function closeOrgLegend(returnFocus) {
  if (!orgLegendEl || orgLegendEl.classList.contains('hidden')) return;
  orgLegendEl.classList.add('hidden');
  if (orgLegendBtn) {
    orgLegendBtn.setAttribute('aria-expanded', 'false');
    if (returnFocus) orgLegendBtn.focus();
  }
  orgLegendBtn = null;
}
function openOrgLegend(btn) {
  if (!orgLegendEl) {
    orgLegendEl = document.createElement('div');
    orgLegendEl.id = 'org-legend-popover';
    orgLegendEl.setAttribute('role', 'dialog');
    orgLegendEl.setAttribute('aria-label', 'Organization codes');
    orgLegendEl.tabIndex = -1;
    orgLegendEl.className = 'hidden absolute z-50 w-56 rounded-xl border border-[#E9DECE] bg-white p-3 shadow-xl text-xs text-[#152548] outline-none';
    const rows = Object.entries(PERMISSIONS_ORGS).map(([code, name]) =>
      `<div class="flex gap-2 py-0.5"><span class="w-8 font-mono font-bold">${escapeHtml(code)}</span><span>${escapeHtml(name)}</span></div>`).join('');
    orgLegendEl.innerHTML = `<p class="font-bold mb-1.5">Organization codes</p>${rows}`;
    document.body.appendChild(orgLegendEl);
  }
  closeOrgLegend(false);
  const r = btn.getBoundingClientRect();
  const maxLeft = window.scrollX + document.documentElement.clientWidth - 232;
  orgLegendEl.style.top = `${r.bottom + window.scrollY + 6}px`;
  orgLegendEl.style.left = `${Math.max(window.scrollX + 8, Math.min(r.left + window.scrollX, maxLeft))}px`;
  orgLegendEl.classList.remove('hidden');
  orgLegendBtn = btn;
  btn.setAttribute('aria-expanded', 'true');
  orgLegendEl.focus();
}
document.addEventListener('click', (e) => {
  const btn = e.target && e.target.closest ? e.target.closest('.org-legend-btn') : null;
  if (btn) {
    e.preventDefault();
    e.stopPropagation();
    if (orgLegendBtn === btn) closeOrgLegend(true); else openOrgLegend(btn);
    return;
  }
  if (orgLegendEl && !orgLegendEl.contains(e.target)) closeOrgLegend(false);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeOrgLegend(true);
});

async function computeSha256(text) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function initRecaptcha() {
  if (window.recaptchaVerifier) return;
  try {
    window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
      size: 'invisible',
      callback: () => { }
    });
  } catch (e) {
    console.warn("Recaptcha verifier error:", e);
  }
}

async function handleSendPhoneCode(e) {
  if (e) {
    if (typeof e.preventDefault === 'function') e.preventDefault();
  }
  const phoneInput = document.getElementById('admin-phone');
  const err = document.getElementById('phone-login-error');
  const btn = document.getElementById('phone-send-btn');
  // 1. Force user to type first and last name
  const nameInput = document.getElementById('admin-name-lookup');
  const enteredName = (nameInput?.value || '').trim();

  if (!enteredName) {
    err.textContent = "Please type your first and last name.";
    err.classList.remove('hidden');
    nameInput?.focus();
    return;
  }

  const nameParts = enteredName.split(/\s+/).filter(Boolean);
  if (nameParts.length < 2) {
    err.textContent = "Please type both your first and last name.";
    err.classList.remove('hidden');
    nameInput?.focus();
    return;
  }

  // 2. Validate mobile phone number
  const rawPhone = (phoneInput?.value || '').trim();
  if (!rawPhone) {
    err.textContent = "Please enter your mobile phone number.";
    err.classList.remove('hidden');
    phoneInput?.focus();
    return;
  }
  const phone = normalizePhone(rawPhone);
  if (phone.length < 11) {
    err.textContent = "Please enter a valid 10-digit mobile phone number.";
    err.classList.remove('hidden');
    phoneInput?.focus();
    return;
  }

  // 3. Verify entered name and phone against authorized leaders
  const pool = [...leadersCache]; // v1.2.93 (cleanup item 2): no hard-coded owner entry; the owner's real ward_leaders record is in the list

  // v1.2.54: if the leader list couldn't be read before sign-in (candidate rules or offline), skip this
  // name pre-check and send the code; access is decided after sign-in from the verified phone only.
  const skipPreCheck = leadersPreAuthFailed;
  const cleanName = enteredName.toLowerCase();
  const leaderMatch = skipPreCheck ? null : (pool.find(l => (l.displayName || '').toLowerCase() === cleanName) ||
    pool.find(l => (l.displayName || '').toLowerCase().includes(cleanName)));

  if (!leaderMatch && !skipPreCheck) {
    err.textContent = GENERIC_SIGNIN_FAILED_MSG;
    err.classList.remove('hidden');
    nameInput?.focus();
    return;
  }

  if (leaderMatch && leaderMatch.phoneNumber) {
    const regPhone = normalizePhone(leaderMatch.phoneNumber);
    if (regPhone && regPhone !== phone) {
      err.textContent = GENERIC_SIGNIN_FAILED_MSG;
      err.classList.remove('hidden');
      phoneInput?.focus();
      return;
    }
  }

  err.classList.add('hidden');
  btn.disabled = true;
  btn.innerHTML = `
    <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
    Sending SMS text...
  `;

  try {
    initRecaptcha();
    appConfirmationResult = await signInWithPhoneNumber(auth, phone, window.recaptchaVerifier);
    document.getElementById('phone-step-1').classList.add('hidden');
    document.getElementById('phone-step-2').classList.remove('hidden');
    document.getElementById('phone-sent-target').textContent = `Text message sent to ${phone}`;
    const codeInput = document.getElementById('admin-sms-code');
    if (codeInput) {
      codeInput.value = '';
      codeInput.focus();
    }
  } catch (errCatch) {
    console.error("SMS send error:", errCatch);
    if (errCatch.code === 'auth/operation-not-allowed') {
      err.textContent = "Phone SMS sign-in is not enabled in Firebase Console yet. Please enable 'Phone' under Firebase Console > Authentication > Sign-in method, or click 'Or sign in with password' below.";
    } else if (errCatch.code === 'auth/invalid-phone-number') {
      err.textContent = "Invalid phone number format. Please enter a valid 10-digit mobile number.";
    } else if (errCatch.code === 'auth/too-many-requests') {
      err.innerHTML = "Too many SMS requests sent recently (Firebase temporary rate limit). Please wait a few minutes, or click <strong>'Or sign in with password'</strong> below to sign in immediately.";
    } else if (errCatch.code === 'auth/quota-exceeded') {
      err.textContent = "SMS quota exceeded for this project. Please sign in with master password or configure test phone numbers in Firebase Console.";
    } else if (errCatch.code === 'auth/captcha-check-failed' || (errCatch.message && errCatch.message.toLowerCase().includes('hostname match not found'))) {
      err.textContent = `Domain not authorized for SMS: Please add '${window.location.hostname}' under Firebase Console > Authentication > Settings > Authorized domains. You can also sign in below with your master password.`;
    } else {
      err.textContent = errCatch.message || "Failed to send verification text. Please check number or try again.";
    }
    err.classList.remove('hidden');
    if (window.recaptchaVerifier) {
      try { window.recaptchaVerifier.clear(); window.recaptchaVerifier = null; } catch (_) { }
    }
  } finally {
    btn.disabled = false;
    btn.textContent = "Send Text Code →";
  }
}

async function handleVerifyPhoneCode(e) {
  if (e) {
    if (typeof e.preventDefault === 'function') e.preventDefault();
  }
  const codeInput = document.getElementById('admin-sms-code');
  const err = document.getElementById('phone-login-error');
  const btn = document.getElementById('phone-verify-btn');
  const code = (codeInput?.value || '').trim();

  if (!code || code.length < 6) {
    err.textContent = "Please enter the complete 6-digit code sent to your phone.";
    err.classList.remove('hidden');
    codeInput?.focus();
    return;
  }

  if (!appConfirmationResult) {
    err.textContent = "Session expired. Please request a new text code.";
    err.classList.remove('hidden');
    return;
  }

  err.classList.add('hidden');
  btn.disabled = true;
  btn.textContent = "Verifying...";

  try {
    const userCredential = await appConfirmationResult.confirm(code);
    const user = userCredential.user;
    const phone = user.phoneNumber;

    // Check ward_leaders collection in Firestore
    // v1.2.54: if this check can't run, never grant access: sign out and say so.
    // v1.2.69: read only this phone's own record(s) (phone-scoped query), never the whole roster.
    let leadersSnap;
    try {
      leadersSnap = (await findLeadersByVerifiedPhone(phone)).map(x => ({ id: x.id, data: () => x }));
    } catch (listErr) {
      console.error("Leader check after phone sign-in failed:", listErr);
      try { await signOut(auth); } catch (_) { }
      err.textContent = LEADERS_POSTAUTH_CHECK_FAILED_MSG;
      err.classList.remove('hidden');
      return;
    }

    // v1.2.69: the empty-collection auto-bootstrap is removed: a phone-scoped result is empty for any unknown
    // phone, and SMS sessions can't write ward_leaders (live rules since 2026-11-21). Owner fallback below remains.

    // Match leader by phone
    let matchedLeader = null;
    leadersSnap.forEach(d => {
      const data = d.data();
      const p = data.phoneNumber ? normalizePhone(data.phoneNumber) : '';
      if ((p === phone || data.phoneNumber === phone) && data.active !== false) {
        matchedLeader = { id: d.id, ...data };
      }
    });

    // Ensure Duane Harris is always recognized as Primary Ward Administrator
    if (phone === '+15084940905') {
      matchedLeader = matchedLeader || {
        id: "leader_duane_harris",
        displayName: "Duane Harris",
        email: "tueini@gmail.com",
        phoneNumber: "+15084940905",
        role: "admin",
        active: true
      };
    }

    // v1.2.55: only RC1-RC6 (spreadsheet area 1) may enter Home admin.
    if (matchedLeader && !isHomeAdminAllowed(matchedLeader)) {
      await refuseHomeAdmin(err);
      return;
    }
    if (matchedLeader) {
      await bindLeaderSession(matchedLeader.id, 'home'); // v1.2.69: lets the tightened rules see this SMS session as this leader
      sessionStorage.setItem('wardLeaderProfile', JSON.stringify(matchedLeader));
      sessionStorage.setItem('wardAdminAuth', 'true');
      setSignInMethod('sms');
      setSSOCookie(matchedLeader);
      resetSubscriptions(); // v1.2.71: re-attach listeners with this (now tied) text session
      checkAuth();
    } else {
      err.textContent = GENERIC_SIGNIN_FAILED_MSG;
      err.classList.remove('hidden');
      await signOut(auth);
    }
  } catch (errCatch) {
    console.error("Code verification error:", errCatch);
    err.textContent = GENERIC_SIGNIN_FAILED_MSG;
    err.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.textContent = "Verify & Enter Portal";
  }
}

// ================= PASSKEY (WEBAUTHN) =================
let passkeyAutofillAbortController = null;

function getWebAuthnRpId() {
  const hostname = window.location.hostname;
  if (hostname.endsWith('blackstoneward.org')) {
    return 'blackstoneward.org';
  }
  return hostname;
}

function getPlatformBiometricName() {
  const userAgent = navigator.userAgent || '';
  const platform = navigator.userAgentData?.platform || navigator.platform || '';
  const isIOS = /iPad|iPhone|iPod/.test(userAgent) || (platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isMac = /Mac/.test(platform) || /Mac/.test(userAgent);
  const isWindows = /Win/.test(platform) || /Windows/.test(userAgent);
  const isAndroid = /Android/.test(userAgent);

  if (isIOS || isMac) {
    return "Touch ID / Face ID";
  }
  if (isWindows) {
    return "Windows Hello";
  }
  if (isAndroid) {
    return "Fingerprint / Face Unlock";
  }
  return "Passkey / Biometrics";
}

// v1.2.61: keep the dashboard enroll button visible after sign-in so a leader can
// re-enroll or refresh even when localStorage already has wardPasskeyRegistered.
function isSignedInLeaderSession() {
  return sessionStorage.getItem('wardAdminAuth') === 'true' && !isBreakGlassProfile(currentLeaderProfile);
}

// v1.2.63: after any leader sign-in (passkey, SMS, personal password, Google) show the header
// Enable/Refresh button. Do not require PublicKeyCredential to un-hide it (a missing API is
// handled on click). Hide it only when logged out or in the master-password break-glass session.
// A full-width banner under the header is shown once when this device has no passkey, so the
// control cannot be clipped off-screen by the sticky header row.
// v1.2.65: never consult isUserVerifyingPlatformAuthenticatorAvailable() here. Chrome incognito
// may report that as false even when window.PublicKeyCredential exists; still show the button
// and, when there is no wardPasskeyRegistered and the banner has not been dismissed, the banner.
function updatePasskeyEnrollButton() {
  const enrollBtn = document.getElementById('btn-enroll-passkey');
  const banner = document.getElementById('passkey-enroll-banner');
  const showForLeader = isSignedInLeaderSession();
  // v1.2.72: a passkey sign-in proves a passkey works here; remember it (fresh/incognito storage) so Enable/banner stop nagging.
  if (isPasskeySession() && !localStorage.getItem('wardPasskeyRegistered')) localStorage.setItem('wardPasskeyRegistered', JSON.stringify({ rpId: getWebAuthnRpId(), source: 'passkey-sign-in', seenAt: new Date().toISOString() }));
  const hasPasskey = !!localStorage.getItem('wardPasskeyRegistered');
  const bioName = getPlatformBiometricName();
  const label = document.getElementById('passkey-enroll-label');
  if (label) label.textContent = hasPasskey ? `Refresh ${bioName}` : `Enable ${bioName}`;
  if (enrollBtn) {
    if (showForLeader) {
      enrollBtn.classList.remove('hidden');
      enrollBtn.classList.add('inline-flex');
      enrollBtn.style.display = 'inline-flex';
      enrollBtn.hidden = false;
    } else {
      enrollBtn.classList.add('hidden');
      enrollBtn.classList.remove('inline-flex', 'flex');
      enrollBtn.style.display = '';
      enrollBtn.hidden = true;
    }
  }
  const bannerLabel = document.getElementById('btn-enroll-passkey-banner-label');
  const bannerText = document.getElementById('passkey-enroll-banner-text');
  if (bannerText) {
    bannerText.textContent = hasPasskey
      ? `${bioName} is enabled on this device. Use Refresh if you need to set it up again.`
      : `Enable ${bioName} on this device so you can sign in without a text code.`;
  }
  if (bannerLabel) bannerLabel.textContent = hasPasskey ? `Refresh ${bioName}` : `Enable ${bioName}`;
  if (banner) {
    const showBanner = showForLeader && !hasPasskey && !localStorage.getItem('wardPasskeyBannerDismissed');
    if (showBanner) {
      banner.classList.remove('hidden');
      banner.style.display = '';
      banner.hidden = false;
    } else {
      banner.classList.add('hidden');
      banner.style.display = '';
      banner.hidden = true;
    }
  }
}

async function initBiometricUI() {
  const bioName = getPlatformBiometricName();

  const loginLabel = document.getElementById('passkey-login-label');
  if (loginLabel) loginLabel.textContent = `Sign In with ${bioName}`;

  updatePasskeyEnrollButton();

  const promptDesc = document.getElementById('passkey-prompt-desc');
  if (promptDesc) {
    promptDesc.textContent = `Would you like to enable ${bioName} on this device? You can sign in with a single tap next time — no text codes required.`;
  }

  const promptBtnLabel = document.getElementById('passkey-prompt-btn-label');
  if (promptBtnLabel) promptBtnLabel.textContent = `Enable ${bioName} Now`;

  // v1.2.65: Chrome incognito (and some desktop browsers) may report
  // isUserVerifyingPlatformAuthenticatorAvailable() as false even when
  // window.PublicKeyCredential exists and a passkey can still be created.
  // Do not hide #passkey-login-container, #btn-enroll-passkey, or
  // #passkey-enroll-banner based on that check or if it throws.
  // The login passkey button stays gated only on PublicKeyCredential in checkAuth.
  // Re-assert enroll button/banner after the async check so a late return cannot
  // leave them at the default HTML hidden state.
  if (window.PublicKeyCredential && typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function') {
    try {
      await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    } catch (_) { }
  }
  updatePasskeyEnrollButton();
}

async function initPasskeyAutofill() {
  // v1.2.63: passkeys stay on the green Sign In button only. Do not start conditional
  // mediation (autocomplete=webauthn) on the name field.
  return;
  if (!window.PublicKeyCredential || typeof PublicKeyCredential.isConditionalMediationAvailable !== 'function') {
    return;
  }
  try {
    const isCMA = await PublicKeyCredential.isConditionalMediationAvailable();
    if (!isCMA) return;

    if (passkeyAutofillAbortController) {
      passkeyAutofillAbortController.abort();
      passkeyAutofillAbortController = null;
    }

    passkeyAutofillAbortController = new AbortController();

    const result = await loginWithCloudPasskey({
      signal: passkeyAutofillAbortController.signal,
      mediation: 'conditional'
    });

    if (result?.verified && result.profile) {
      if (result.customToken) {
        await signInWithCustomToken(auth, result.customToken).catch(() => { });
      }
      let profile = result.profile;
      // v1.2.55: the passkey API returns only some fields; read this leader's rcCodes/calling/active, then gate.
      try {
        const leaderSnap = await getDoc(doc(db, "ward_leaders", String(profile.id || '')));
        if (leaderSnap.exists()) {
          const d = leaderSnap.data() || {};
          profile = { ...profile, rcCodes: d.rcCodes, calling: d.calling || profile.calling, active: d.active };
        }
      } catch (_) { }
      if (!isHomeAdminAllowed(profile)) {
        await refuseHomeAdmin(null);
        return;
      }
      sessionStorage.setItem('wardLeaderProfile', JSON.stringify(profile));
      sessionStorage.setItem('wardAdminAuth', 'true');
      setSignInMethod('passkey');
      setSSOCookie(profile);
      resetSubscriptions(); // v1.2.71: re-attach listeners with this passkey session
      checkAuth();
    }
  } catch (err) {
    if (err && err.name !== 'AbortError' && err.name !== 'NotAllowedError') {
      console.warn("Passkey autofill:", err);
    }
  }
}

// v1.2.65: visible working state for the whole enrollCloudPasskey() call
// (options + browser prompt + server verify). Labels are restored in finally.
function setPasskeyEnrollWorking(isWorking) {
  const ids = ['btn-enroll-passkey', 'btn-enroll-passkey-banner', 'btn-prompt-enable-passkey'];
  const labelIds = ['passkey-enroll-label', 'btn-enroll-passkey-banner-label', 'passkey-prompt-btn-label'];
  for (const id of ids) {
    const btn = document.getElementById(id);
    if (!btn) continue;
    btn.disabled = !!isWorking;
    btn.setAttribute('aria-busy', isWorking ? 'true' : 'false');
  }
  if (isWorking) {
    for (const id of labelIds) {
      const el = document.getElementById(id);
      if (el) el.textContent = 'Saving passkey to server…';
    }
  } else {
    updatePasskeyEnrollButton();
    const promptBtnLabel = document.getElementById('passkey-prompt-btn-label');
    if (promptBtnLabel) promptBtnLabel.textContent = `Enable ${getPlatformBiometricName()} Now`;
  }
}

async function handleEnrollPasskey() {
  if (!window.PublicKeyCredential) {
    alert("Biometrics / Passkeys are not supported on this browser.");
    return;
  }
  let profile = null;
  try {
    profile = JSON.parse(sessionStorage.getItem('wardLeaderProfile') || 'null');
  } catch (_) { }
  // v1.2.65: enroll only from a real signed-in leader session; never the generic Ward Leader fallback.
  if (!profile || !isSignedInLeaderSession() || isBreakGlassProfile(profile) || profile.displayName === 'Master Admin') {
    alert("Please sign in as a leader (phone text code, password or Google) before enabling Touch ID / Face ID.");
    return;
  }

  // v1.2.70: the passkey server (passkeyApi 1.1.0) needs this browser's Firebase sign-in (text code or passkey) for this leader.
  if (!auth.currentUser) {
    alert(PASSKEY_SIGNIN_REQUIRED_MSG);
    return;
  }
  setPasskeyEnrollWorking(true);
  try {
    const result = await enrollCloudPasskey(profile, { idToken: await auth.currentUser.getIdToken() });

    if (result?.verified) {
      localStorage.setItem('wardPasskeyRegistered', JSON.stringify({
        id: result.credentialId,
        profile: result.profile || profile,
        rpId: getWebAuthnRpId(),
        enrolledAt: new Date().toISOString()
      }));
      alert(`${getPlatformBiometricName()} successfully enabled for all Blackstone Ward hubs!`);
      updatePasskeyEnrollButton();
      const promptModal = document.getElementById('passkey-prompt-modal');
      if (promptModal) promptModal.classList.add('hidden');
      checkAuth();
    }
  } catch (e) {
    if (e.name !== 'NotAllowedError') {
      console.error("Passkey error:", e);
      const msg = String((e && e.message) || '');
      const alreadyRegistered = e.name === 'InvalidStateError' || /already registered|authenticator that contains one of the credentials already registered/i.test(msg);
      if (alreadyRegistered) {
        localStorage.removeItem('wardPasskeyRegistered');
        localStorage.removeItem('wardPasskeyPromptDismissed');
        localStorage.removeItem('wardPasskeyBannerDismissed');
        updatePasskeyEnrollButton();
        alert("This device already has your passkey, so there is nothing to set up. Just sign in with Touch ID."); // v1.2.75 (Duane voice 11:34 PM ET): InvalidStateError means this authenticator already holds one of this leader's ward_passkeys credentials
      } else {
        alert("Could not register passkey: " + e.message);
      }
    }
  } finally {
    setPasskeyEnrollWorking(false);
  }
}

function maybeShowPasskeyOnboardingPrompt(profile) {
  if (isPasskeySession()) return; // v1.2.72 (Duane, voice 9:56 PM ET): a passkey sign-in already has a passkey; never offer to enable one
  if (isBreakGlassProfile(profile) || !isSignedInLeaderSession()) return;
  if (localStorage.getItem('wardPasskeyRegistered')) return;
  if (localStorage.getItem('wardPasskeyPromptDismissed')) return;

  const modal = document.getElementById('passkey-prompt-modal');
  const nameEl = document.getElementById('passkey-prompt-leader-name');
  if (!modal) return;

  const firstName = (profile?.displayName || 'Leader').trim().split(/\s+/)[0];
  if (nameEl) nameEl.textContent = firstName;

  setTimeout(() => {
    if (sessionStorage.getItem('wardAdminAuth') === 'true' && !localStorage.getItem('wardPasskeyRegistered') && !isPasskeySession()) { // v1.2.72
      modal.classList.remove('hidden');
    }
  }, 700);
}

async function handlePasskeyLogin() {
  if (!window.PublicKeyCredential) {
    alert(`${getPlatformBiometricName()} is not supported on this browser.`);
    return;
  }

  const hintEl = document.getElementById('passkey-hint-msg');
  if (hintEl) hintEl.classList.add('hidden');

  if (passkeyAutofillAbortController) {
    passkeyAutofillAbortController.abort();
    passkeyAutofillAbortController = null;
  }

  try {
    const typedName = (
      document.getElementById('admin-name-lookup')?.value ||
      document.getElementById('password-leader-lookup')?.value ||
      ''
    ).trim();

    const result = await loginWithCloudPasskey({ leaderName: typedName });

    if (result?.verified && result.profile) {
      // v1.2.68: do not mark a passkey session unless Firebase custom-token sign-in succeeded.
      if (!result.customToken) {
        const short = 'missing-custom-token';
        console.info('Passkey Firebase sign-in failed', { code: short });
        const msg = `Passkey verified, but Firebase sign-in failed (${short}). Please try again.`;
        if (hintEl) {
          hintEl.textContent = msg;
          hintEl.classList.remove('hidden');
        }
        alert(msg);
        return;
      }
      try {
        await signInWithCustomToken(auth, result.customToken);
      } catch (tokenErr) {
        const raw = String((tokenErr && (tokenErr.code || tokenErr.message)) || 'sign-in-failed');
        const m = raw.match(/auth\/[a-z0-9_-]+/i);
        const short = m ? m[0] : (tokenErr && tokenErr.code ? String(tokenErr.code) : raw.split(/[\s:]/)[0] || 'sign-in-failed');
        console.info('Passkey Firebase sign-in failed', { code: short });
        const msg = `Passkey verified, but Firebase sign-in failed (${short}). Please try again.`;
        if (hintEl) {
          hintEl.textContent = msg;
          hintEl.classList.remove('hidden');
        }
        alert(msg);
        return;
      }
      let profile = result.profile;
      // v1.2.55: the passkey API returns only some fields; read this leader's rcCodes/calling/active, then gate.
      try {
        const leaderSnap = await getDoc(doc(db, "ward_leaders", String(profile.id || '')));
        if (leaderSnap.exists()) {
          const d = leaderSnap.data() || {};
          profile = { ...profile, rcCodes: d.rcCodes, calling: d.calling || profile.calling, active: d.active };
        }
      } catch (_) { }
      if (!isHomeAdminAllowed(profile)) {
        await refuseHomeAdmin(null);
        return;
      }
      sessionStorage.setItem('wardLeaderProfile', JSON.stringify(profile));
      sessionStorage.setItem('wardAdminAuth', 'true');
      setSignInMethod('passkey');
      setSSOCookie(profile);
      resetSubscriptions(); // v1.2.71: re-attach listeners with this passkey session
      checkAuth();
    }
  } catch (e) {
    const bioName = getPlatformBiometricName();
    if (e.name !== 'NotAllowedError') {
      console.error("Passkey login error:", e);
      // v1.2.64: drop the stale local passkey flag so Enable/Refresh and the banner can show after a later SMS/password/Google sign-in.
      localStorage.removeItem('wardPasskeyRegistered');
      localStorage.removeItem('wardPasskeyPromptDismissed');
      localStorage.removeItem('wardPasskeyBannerDismissed');
      updatePasskeyEnrollButton();
      const detail = (e && e.message) ? ` ${e.message}` : '';
      const msg = String((e && e.message) || '');
      const unrecognized = /not found|not recognised|not recognized|directory|no passkey|404/i.test(msg);
      const why = unrecognized
        ? " This passkey is not recognized for your account."
        : "";
      alert(`${bioName} verification failed.${why}${detail} Sign in with a phone text code, then click Refresh ${bioName} to set it up again on this device. If an old passkey is saved, delete it in Chrome or in Apple Passwords, then refresh.`);
    } else {
      const saved = localStorage.getItem('wardPasskeyRegistered');
      if (!saved && hintEl) {
        hintEl.textContent = `No ${bioName} passkey found on this device for blackstoneward.org yet. Please sign in with your phone text code below first, then click 'Enable ${bioName}'.`;
        hintEl.classList.remove('hidden');
      }
    }
    if (sessionStorage.getItem('wardAdminAuth') !== 'true') {
      initPasskeyAutofill();
    }
  }
}

function checkAuth() {
  const isAuth = sessionStorage.getItem('wardAdminAuth') === 'true';
  // v1.2.55: refuse a stored non-RC1-RC6 profile (the no-profile/'Master Admin' owner fallback below is unchanged).
  if (isAuth) {
    let storedProfile = null;
    try { storedProfile = JSON.parse(sessionStorage.getItem('wardLeaderProfile') || 'null'); } catch (_) { }
    if (storedProfile && storedProfile.displayName && storedProfile.displayName !== 'Master Admin' && !isHomeAdminAllowed(storedProfile)) {
      refuseHomeAdmin(null).finally(() => checkAuth());
      return;
    }
    // v1.2.91 (#3): the master-password break-glass session is retired. A tab with no leader profile (or an old
    // 'Master Admin' / break-glass session) is signed out instead of being opened as break-glass.
    if (!storedProfile || !storedProfile.displayName || storedProfile.displayName === 'Master Admin' || sessionStorage.getItem('wardAdminBreakGlass') === 'true') {
      refuseHomeAdmin(null).finally(() => checkAuth());
      return;
    }
  }
  const loginView = document.getElementById('login-view');
  const dashView = document.getElementById('dashboard-view');
  if (isAuth) {
    if (passkeyAutofillAbortController) {
      passkeyAutofillAbortController.abort();
      passkeyAutofillAbortController = null;
    }
    loginView.classList.add('hidden');
    dashView.classList.remove('hidden');

    // Display Leader Identity Badge
    let profile = null;
    try {
      profile = JSON.parse(sessionStorage.getItem('wardLeaderProfile') || 'null');
    } catch (_) { }
    if (!profile || profile.displayName === 'Master Admin' || !profile.displayName) {
      // v1.2.58 (D4): a signed-in tab without a leader profile is the master-password break-glass session
      // (Home area 1 only), no longer the owner record.
      sessionStorage.setItem('wardAdminBreakGlass', 'true');
      profile = { id: BREAK_GLASS_ID, displayName: "Master Admin", breakGlass: true };
    }
    profile.role = resolveLeaderRole(profile);
    profile.calling = getLeaderCalling(profile);
    profile.org = getLeaderOrg(profile);
    profile.accessAreas = getLeaderAccessAreas(profile);
    sessionStorage.setItem('wardLeaderProfile', JSON.stringify(profile));
    currentLeaderProfile = profile;
    setSSOCookie(profile);

    const badge = document.getElementById('leader-identity-badge');
    const nameEl = document.getElementById('leader-display-name');
    const roleEl = document.getElementById('leader-role-label');
    const emailEl = document.getElementById('leader-email-label');
    const initialsEl = document.getElementById('leader-avatar-initials');

    if (badge && nameEl) {
      nameEl.textContent = profile.displayName || 'Leader'; // v1.2.93: no hard-coded name/email fallback
      if (emailEl) emailEl.textContent = profile.email || profile.phoneNumber || '';
      if (roleEl) {
        const roleDef = ROLE_DEFINITIONS[profile.role] || { label: 'Ward Leader', fullAccess: false };
        const areas = getLeaderAccessAreas(profile);
        if (isBreakGlassProfile(profile)) {
          roleEl.textContent = 'Master password: Home admin only'; // v1.2.58 (D4)
        } else if (getHomeAdminSeats(profile).length) {
          roleEl.textContent = getLeaderCallingLabels(profile).title; // v1.2.58: seat callings, e.g. "Bishop"
        } else if (profile.role === 'admin' || profile.role === 'bishopric') {
          roleEl.textContent = roleDef.label;
        } else if (areas.length > 0 && areas.length < 7) {
          roleEl.textContent = `${roleDef.label} • ${areas.join(', ')}`;
        } else {
          roleEl.textContent = roleDef.label;
        }
      }
      if (initialsEl) {
        const parts = (profile.displayName || 'Leader').trim().split(/\s+/);
        const initials = parts.length > 1 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : parts[0].slice(0, 2).toUpperCase();
        initialsEl.textContent = initials;
        initialsEl.style.color = '#ffffff';
      }
      badge.classList.remove('hidden');
      badge.classList.add('flex');
    }

    // Passkey enroll button (v1.2.61: always shown after sign-in; label is Enable or Refresh)
    updatePasskeyEnrollButton();

    maybeShowPasskeyOnboardingPrompt(profile);

    // Role-Based Access Control on UI:
    // Authorized Leaders tab is accessible to all leaders so org users can change passwords in their own org
    const tabLead = document.getElementById('tab-leaders');
    if (tabLead) {
      tabLead.classList.remove('hidden');
    }

    // Restrict Settings tab (Ward Announcements & Spotlights) to Admin, Bishopric, or leaders with "Settings & Privacy" access
    const tabSet = document.getElementById('tab-settings');
    const secSet = document.getElementById('section-settings');
    const tabCal = document.getElementById('tab-calendar');
    const secCal = document.getElementById('section-calendar');
    if (tabSet) {
      if (canUserAccessWardSettings(profile)) {
        tabSet.classList.remove('hidden');
      } else {
        tabSet.classList.add('hidden');
        if (secSet && !secSet.classList.contains('hidden')) {
          secSet.classList.add('hidden');
          if (tabCal) tabCal.className = 'tab-btn active px-4 py-2 rounded-t-lg font-semibold text-xs tracking-wide transition flex items-center gap-2';
          if (secCal) secCal.classList.remove('hidden');
        }
      }
    }

    // "+ Add Ward Leader" button is visible only to Ward Admin and Bishopric
    const btnAddLeader = document.getElementById('btn-add-leader');
    if (btnAddLeader) {
      if (canUserAddLeader()) {
        btnAddLeader.classList.remove('hidden');
      } else {
        btnAddLeader.classList.add('hidden');
      }
    }

    // Render calendar, lists, and tables immediately on auth so the UI is responsive without delay
    renderCalendarGrid();
    renderCalendarList();
    renderAnnouncements();
    renderSpotlights();
    renderLeadersTable();

    initSubscriptions();
  } else {
    loginView.classList.remove('hidden');
    dashView.classList.add('hidden');
    updatePasskeyEnrollButton();

    // Show biometric button if browser supports biometrics/WebAuthn and initialize platform labels
    const passkeyBox = document.getElementById('passkey-login-container');
    if (passkeyBox) {
      if (window.PublicKeyCredential) {
        passkeyBox.classList.remove('hidden');
        initBiometricUI();
      } else {
        passkeyBox.classList.add('hidden');
      }
    }

    initPasskeyAutofill();
  }
}

async function handleGoogleSignIn() {
  const err = document.getElementById('google-login-error');
  const btn = document.getElementById('btn-google-signin');
  const showErr = (msg) => {
    if (!err) { alert(msg); return; }
    err.textContent = msg;
    err.classList.remove('hidden');
  };
  if (err) {
    err.textContent = '';
    err.classList.add('hidden');
  }

  try {
    if (btn) btn.disabled = true;
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const result = await signInWithPopup(auth, provider);
    const user = result.user;
    const googleEmail = String(user?.email || '').trim();
    if (!googleEmail) {
      try { await signOut(auth); } catch (_) { }
      showErr("This Google account has no email address, so it can't be matched to a ward leader.");
      return;
    }
    if (user.emailVerified === false) {
      try { await signOut(auth); } catch (_) { }
      showErr("This Google account's email is not verified. Please verify it with Google and try again.");
      return;
    }

    // v1.2.74 (Duane voice 11:06 PM ET): read only this leader's record, by the lower-cased Google email. The rules
    // (google draft 2026-11-22) let a Google-verified session read just the ward_leaders doc whose email equals its
    // lower-cased token email; stored leader emails are lower-case, so no as-typed fallback is needed.
    const want = googleEmail.toLowerCase();
    let leadersSnap;
    try {
      leadersSnap = await getDocs(query(collection(db, "ward_leaders"), where("email", "==", want)));
    } catch (listErr) {
      console.error("Leader check after Google sign-in failed:", listErr);
      try { await signOut(auth); } catch (_) { }
      showErr("Google sign-in succeeded, but the leader list couldn't be checked, so you weren't signed in. Please try again.");
      return;
    }

    const matches = [];
    leadersSnap.forEach(d => {
      const data = d.data() || {};
      if (data.active === false) return;
      if (String(data.email || '').trim().toLowerCase() === want) {
        matches.push({ id: d.id, ...data });
      }
    });

    if (matches.length === 0) {
      try { await signOut(auth); } catch (_) { }
      showErr("No active ward leader is registered with this Google email. Please contact an administrator.");
      return;
    }
    if (matches.length > 1) {
      try { await signOut(auth); } catch (_) { }
      showErr("More than one active leader is registered with this Google email. Please contact an administrator.");
      return;
    }

    const matchedLeader = matches[0];
    if (!isHomeAdminAllowed(matchedLeader)) {
      await refuseHomeAdmin(err);
      return;
    }
    sessionStorage.setItem('wardLeaderProfile', JSON.stringify(matchedLeader));
    sessionStorage.setItem('wardAdminAuth', 'true');
    setSignInMethod('google');
    setSSOCookie(matchedLeader);
    checkAuth();
  } catch (e) {
    const code = e && e.code;
    if (code === 'auth/operation-not-allowed') {
      showErr("Google sign-in is not enabled for this site yet. An administrator needs to enable the Google provider in Firebase Authentication.");
    } else if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
      // The user closed the popup; no error banner.
    } else if (code === 'auth/popup-blocked') {
      showErr("The Google sign-in popup was blocked. Please allow popups for this site and try again.");
    } else {
      console.error("Google sign-in error:", e);
      showErr((e && e.message) || "Google sign-in failed. Please try again.");
    }
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function handleLogin(e) {
  if (e) {
    if (typeof e.preventDefault === 'function') e.preventDefault();
    if (typeof e.stopPropagation === 'function') e.stopPropagation();
  }
  const input = document.getElementById('admin-passcode');
  const nameLookup = document.getElementById('password-leader-lookup');
  const err = document.getElementById('login-error');
  const btn = document.getElementById('login-btn');
  const val = (input?.value || '').trim();
  const leaderName = (nameLookup?.value || document.getElementById('admin-name-lookup')?.value || '').trim();

  if (!leaderName) {
    if (err) {
      err.textContent = "Please type your first and last name.";
      err.classList.remove('hidden');
    }
    nameLookup?.focus();
    return;
  }

  const nameParts = leaderName.split(/\s+/).filter(Boolean);
  if (nameParts.length < 2) {
    if (err) {
      err.textContent = "Please type both your first and last name.";
      err.classList.remove('hidden');
    }
    nameLookup?.focus();
    return;
  }

  if (!val) {
    if (err) {
      err.textContent = "Please enter your password.";
      err.classList.remove('hidden');
    }
    if (input) input.focus();
    return;
  }
  if (err) err.classList.add('hidden');
  if (btn) btn.textContent = 'Verifying...';

  try {
    // v1.2.91 (Duane 2026-11-23, #2/#3): the temporary master password (break-glass) is retired, and personal leader
    // passwords are checked only on the server (passkeyApi 1.4.0 /password/login, salted scrypt). The browser sends the
    // typed name and password to the server and never hashes or compares passwords. A name is required (it is above).
    if (PERSONAL_LEADER_PASSWORDS_DISABLED) {
      if (err) {
        err.textContent = GENERIC_SIGNIN_FAILED_MSG;
        err.classList.remove('hidden');
      }
      if (btn) btn.textContent = 'Sign In with Password';
      return;
    }
    let pwResult = null;
    try {
      pwResult = await loginWithLeaderPassword({ leaderName, password: val });
    } catch (pwErr) {
      if (err) {
        // 429 (too many tries) and 5xx (unavailable) carry the server's own message; anything else stays generic.
        err.textContent = (pwErr?.status === 429 || pwErr?.status >= 500) ? pwErr.message : GENERIC_SIGNIN_FAILED_MSG;
        err.classList.remove('hidden');
      }
      if (btn) btn.textContent = 'Sign In with Password';
      if (input) { input.select(); input.focus(); }
      return;
    }
    // passkeyApi 1.4.0 returns the leader's profile; with 1.3.0 (until the function deploy) use the cached record by name.
    const pwOk = !!(pwResult && pwResult.ok);
    const cachedByName = pwOk ? leadersCache.find(l => (l.displayName || '').trim().toLowerCase().replace(/\s+/g, ' ') === leaderName.toLowerCase().replace(/\s+/g, ' ')) : null;
    const serverProfile = pwOk && pwResult.profile && pwResult.profile.id ? pwResult.profile : (cachedByName || null);
    if (!serverProfile) {
      if (err) {
        err.textContent = GENERIC_SIGNIN_FAILED_MSG;
        err.classList.remove('hidden');
      }
      if (btn) btn.textContent = 'Sign In with Password';
      if (input) { input.select(); input.focus(); }
      return;
    }
    const { passwordHash: _droppedHash, ...matchedLeader } = leadersCache.find(l => l.id === serverProfile.id) || serverProfile;
    sessionStorage.setItem('wardLeaderProfile', JSON.stringify(matchedLeader));
    sessionStorage.setItem('wardAdminAuth', 'true');
    setSignInMethod('password');
    setSSOCookie(matchedLeader);
    input.value = '';
    if (btn) btn.textContent = 'Sign In with Password';
    checkAuth();
  } catch (errCatch) {
    console.error("Auth error", errCatch);
    if (err) {
      err.textContent = "An error occurred while verifying password. Please try again.";
      err.classList.remove('hidden');
    }
    if (btn) btn.textContent = 'Sign In with Password';
  }
}

async function handleLogout() {
  clearSSOCookie();
  sessionStorage.removeItem('wardAdminAuth');
  sessionStorage.removeItem('wardLeaderProfile');
  sessionStorage.removeItem('wardAdminBreakGlass'); // v1.2.58
  sessionStorage.removeItem('wardAdminSignInMethod'); // v1.2.60
  currentLeaderProfile = null;
  try {
    await signOut(auth);
  } catch (_) { }
  resetSubscriptions(); // v1.2.71

  // Thoroughly wipe all inputs so no prior data is displayed
  const nameLookup = document.getElementById('admin-name-lookup');
  if (nameLookup) nameLookup.value = '';

  const pwLeaderLookup = document.getElementById('password-leader-lookup');
  if (pwLeaderLookup) pwLeaderLookup.value = '';

  const phoneInput = document.getElementById('admin-phone');
  if (phoneInput) phoneInput.value = '';

  const smsInput = document.getElementById('admin-sms-code');
  if (smsInput) smsInput.value = '';

  const pwInput = document.getElementById('admin-passcode');
  if (pwInput) pwInput.value = '';

  const matchIndicator = document.getElementById('leader-match-indicator');
  if (matchIndicator) {
    matchIndicator.classList.add('hidden');
    matchIndicator.classList.remove('flex');
  }

  const phoneErr = document.getElementById('phone-login-error');
  if (phoneErr) phoneErr.classList.add('hidden');

  const pwErr = document.getElementById('login-error');
  if (pwErr) pwErr.classList.add('hidden');

  // Reset phone steps back to Step 1
  const step1 = document.getElementById('phone-step-1');
  const step2 = document.getElementById('phone-step-2');
  if (step1) step1.classList.remove('hidden');
  if (step2) step2.classList.add('hidden');

  // Reset to phone login by default
  const phoneForm = document.getElementById('phone-login-form');
  const loginForm = document.getElementById('login-form');
  const togglePasscodeBtn = document.getElementById('toggle-passcode-view-btn');
  if (phoneForm) phoneForm.classList.remove('hidden');
  if (loginForm) loginForm.classList.add('hidden');
  if (togglePasscodeBtn && togglePasscodeBtn.parentElement) {
    togglePasscodeBtn.parentElement.classList.remove('hidden');
  }

  checkAuth();
}

// ================= NAVIGATION =================
function setupNavigation() {
  const tabCal = document.getElementById('tab-calendar');
  const tabLead = document.getElementById('tab-leaders');
  const tabSet = document.getElementById('tab-settings');
  const secCal = document.getElementById('section-calendar');
  const secLead = document.getElementById('section-leaders');
  const secSet = document.getElementById('section-settings');

  function resetTabs() {
    [tabCal, tabLead, tabSet].forEach(t => {
      if (t) t.className = 'tab-btn bg-slate-100 text-[#536484] hover:text-[#152548] px-4 py-2 rounded-t-lg font-semibold text-xs tracking-wide transition flex items-center gap-2';
    });
    [secCal, secLead, secSet].forEach(s => {
      if (s) s.classList.add('hidden');
    });
  }

  if (tabCal) {
    tabCal.addEventListener('click', () => {
      resetTabs();
      tabCal.className = 'tab-btn active px-4 py-2 rounded-t-lg font-semibold text-xs tracking-wide transition flex items-center gap-2';
      secCal?.classList.remove('hidden');
    });
  }

  if (tabLead) {
    tabLead.addEventListener('click', () => {
      resetTabs();
      tabLead.className = 'tab-btn active px-4 py-2 rounded-t-lg font-semibold text-xs tracking-wide transition flex items-center gap-2';
      secLead?.classList.remove('hidden');
      renderLeadersTable();
    });
  }

  if (tabSet) {
    tabSet.addEventListener('click', () => {
      resetTabs();
      tabSet.className = 'tab-btn active px-4 py-2 rounded-t-lg font-semibold text-xs tracking-wide transition flex items-center gap-2';
      secSet?.classList.remove('hidden');
    });
  }

  // Settings Sub-tabs
  const subAnn = document.getElementById('subtab-announcements');
  const subSpot = document.getElementById('subtab-spotlights');
  const panelAnn = document.getElementById('panel-announcements');
  const panelSpot = document.getElementById('panel-spotlights');

  if (subAnn && subSpot) {
    subAnn.addEventListener('click', () => {
      subAnn.className = 'subtab-btn active pb-3 text-sm font-semibold transition';
      subSpot.className = 'subtab-btn pb-3 text-sm text-[#536484] hover:text-[#152548] transition';
      panelAnn?.classList.remove('hidden');
      panelSpot?.classList.add('hidden');
    });

    subSpot.addEventListener('click', () => {
      subSpot.className = 'subtab-btn active pb-3 text-sm font-semibold transition';
      subAnn.className = 'subtab-btn pb-3 text-sm text-[#536484] hover:text-[#152548] transition';
      panelSpot?.classList.remove('hidden');
      panelAnn?.classList.add('hidden');
    });
  }

  // Calendar View Toggle
  const btnViewCal = document.getElementById('btn-view-calendar');
  const btnViewList = document.getElementById('btn-view-list');
  const viewCalContainer = document.getElementById('view-calendar-container');
  const viewListContainer = document.getElementById('view-list-container');

  if (btnViewCal && btnViewList && viewCalContainer && viewListContainer) {
    btnViewCal.addEventListener('click', () => {
      btnViewCal.className = 'px-4 py-1.5 rounded-full text-xs font-semibold bg-[#152548] text-white shadow-xs transition cursor-pointer';
      btnViewCal.style.color = '#ffffff';
      btnViewList.className = 'px-4 py-1.5 rounded-full text-xs font-semibold text-slate-500 hover:text-slate-800 transition cursor-pointer';
      btnViewList.style.color = '';
      viewCalContainer.classList.remove('hidden');
      viewListContainer.classList.add('hidden');
    });

    btnViewList.addEventListener('click', () => {
      btnViewList.className = 'px-4 py-1.5 rounded-full text-xs font-semibold bg-[#152548] text-white shadow-xs transition cursor-pointer';
      btnViewList.style.color = '#ffffff';
      btnViewCal.className = 'px-4 py-1.5 rounded-full text-xs font-semibold text-slate-500 hover:text-slate-800 transition cursor-pointer';
      btnViewCal.style.color = '';
      viewListContainer.classList.remove('hidden');
      viewCalContainer.classList.add('hidden');
    });
  }

  // Month navigation buttons
  const btnAdminPrev = document.getElementById('btn-admin-prev-month');
  const btnAdminNext = document.getElementById('btn-admin-next-month');
  const btnAdminToday = document.getElementById('btn-admin-jump-today');
  const btnAdminIcs = document.getElementById('btn-admin-download-schedule');

  if (btnAdminPrev) {
    btnAdminPrev.addEventListener('click', () => {
      if (adminCalMonth === 0) {
        adminCalMonth = 11;
        adminCalYear--;
      } else {
        adminCalMonth--;
      }
      renderCalendarGrid();
    });
  }

  if (btnAdminNext) {
    btnAdminNext.addEventListener('click', () => {
      if (adminCalMonth === 11) {
        adminCalMonth = 0;
        adminCalYear++;
      } else {
        adminCalMonth++;
      }
      renderCalendarGrid();
    });
  }

  if (btnAdminToday) {
    btnAdminToday.addEventListener('click', () => {
      const now = new Date();
      adminCalYear = now.getFullYear();
      adminCalMonth = now.getMonth();
      renderCalendarGrid();
    });
  }

  if (btnAdminIcs) {
    btnAdminIcs.addEventListener('click', downloadAdminCalendarICS);
  }
}

// ================= SUBSCRIPTIONS =================
let unsubEvents = null;
let unsubAnn = null;
let unsubSpot = null;
let unsubLead = null;
// v1.2.71 (Duane, chat 9:39 PM ET): initSubscriptions() runs once per page (guard below), and a listener that got
// permission-denied stays dead. Stop and forget all four listeners on logout and on each successful text/passkey
// sign-in so the next checkAuth() re-attaches them with the CURRENT Firebase session (e.g. after the leader_sessions tie).
function resetSubscriptions() {
  for (const u of [unsubEvents, unsubAnn, unsubSpot, unsubLead]) { try { if (u) u(); } catch (_) { } }
  unsubEvents = unsubAnn = unsubSpot = unsubLead = null;
  leadersTableDenied = false;
}

function initSubscriptions() {
  if (unsubEvents) return; // already initialized

  // Load from local storage cache immediately so all saved items render instantly
  try {
    const savedEvents = localStorage.getItem('local_ward_events');
    if (savedEvents) {
      const parsed = JSON.parse(savedEvents);
      if (Array.isArray(parsed) && parsed.length > 0) {
        eventsCache = parsed.filter(e => Boolean(e.date || e.startAt));
        try { localStorage.setItem('local_ward_events', JSON.stringify(eventsCache)); } catch (_) { }
      }
    }
    const savedAnn = localStorage.getItem('local_ward_announcements');
    if (savedAnn) {
      const parsed = JSON.parse(savedAnn);
      if (Array.isArray(parsed) && parsed.length > 0) announcementsCache = parsed;
    }
    const savedSpot = localStorage.getItem('local_ward_spotlights');
    if (savedSpot) {
      const parsed = JSON.parse(savedSpot);
      if (Array.isArray(parsed) && parsed.length > 0) spotlightsCache = parsed;
    }
  } catch (_) { }

  // 1. Ward_events
  unsubEvents = onSnapshot(collection(db, "Ward_events"), (snapshot) => {
    const list = [];
    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      if (data.date || data.startAt) {
        list.push({ id: docSnap.id, ...data });
      }
    });
    eventsCache = list;
    try { localStorage.setItem('local_ward_events', JSON.stringify(eventsCache)); } catch (_) { }
    renderCalendarGrid();
    renderCalendarList();
  }, (err) => {
    console.warn("Firestore Ward_events error:", err);
  });

  // Listen to Combined_events solely to populate the Youth Hub Transfer dialog (does not auto-merge)
  try {
    onSnapshot(collection(db, "Combined_events"), (snapshot) => {
      youthHubEvents = [];
      snapshot.forEach(docSnap => {
        youthHubEvents.push({ id: docSnap.id, ...docSnap.data() });
      });
      youthHubEvents.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    }, (err) => {
      console.warn("Combined_events sync error:", err);
    });
  } catch (_) { }

  // 2. home_announcements & ward_announcements
  unsubAnn = onSnapshot(collection(db, "home_announcements"), (snapshot) => {
    const remoteWardAnns = [];
    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      if (data && (data.org === 'Ward' || (typeof data.title === 'string' && data.title.trim()))) {
        remoteWardAnns.push({ id: docSnap.id, ...data });
      }
    });
    announcementsCache = remoteWardAnns;
    announcementsCache.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (b.timestamp || 0) - (a.timestamp || 0));
    try { localStorage.setItem('local_ward_announcements', JSON.stringify(announcementsCache)); } catch (_) { }
    renderAnnouncements();
  }, (err) => {
    console.warn("Firestore home_announcements error:", err);
  });

  // 3. ward_spotlights
  unsubSpot = onSnapshot(collection(db, "ward_spotlights"), (snapshot) => {
    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      const existing = spotlightsCache.findIndex(s => s.id === docSnap.id);
      if (existing >= 0) spotlightsCache[existing] = { id: docSnap.id, ...data };
      else spotlightsCache.push({ id: docSnap.id, ...data });
    });
    spotlightsCache.sort((a, b) => (Number(a.sortOrder) || 99) - (Number(b.sortOrder) || 99));
    try { localStorage.setItem('local_ward_spotlights', JSON.stringify(spotlightsCache)); } catch (_) { }
    renderSpotlights();
  }, (err) => {
    console.warn("Firestore ward_spotlights error:", err);
  });

  // 4. ward_leaders (RBAC Leader Roster)
  unsubLead = onSnapshot(collection(db, "ward_leaders"), (snapshot) => {
    leadersTableDenied = false;
    leadersDeniedPopupShown = false; // v1.2.76
    leadersCache = [];
    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      const item = { id: docSnap.id, ...data };
      const resolvedRole = resolveLeaderRole(item);
      const resolvedOrg = getLeaderOrg(item);
      if (item.role !== resolvedRole || item.org !== resolvedOrg) {
        item.role = resolvedRole;
        item.org = resolvedOrg;
        setDoc(doc(db, "ward_leaders", docSnap.id), { role: resolvedRole, org: resolvedOrg }, { merge: true }).catch(() => { });
      }
      leadersCache.push(item);
    });

    // v1.2.93 (cleanup item 2): the owner record is no longer auto-created/re-seeded from the browser; it lives in ward_leaders.

    // Sync active session profile if current logged-in leader's role/accessAreas were updated
    if (currentLeaderProfile) {
      const cleanName = (currentLeaderProfile.displayName || '').toLowerCase().trim();
      const matched = leadersCache.find(l =>
        (currentLeaderProfile.id && l.id === currentLeaderProfile.id) ||
        (cleanName && (l.displayName || '').toLowerCase().trim() === cleanName)
      );
      if (matched && !isBreakGlassProfile(currentLeaderProfile)) { // v1.2.58: break-glass never merges into a leader
        currentLeaderProfile = { ...currentLeaderProfile, ...matched, role: resolveLeaderRole(matched) };
        sessionStorage.setItem('wardLeaderProfile', JSON.stringify(currentLeaderProfile));
        setSSOCookie(currentLeaderProfile);
        const roleEl = document.getElementById('leader-role-label');
        if (roleEl) {
          const roleDef = ROLE_DEFINITIONS[currentLeaderProfile.role] || { label: 'Ward Leader', fullAccess: false };
          const areas = getLeaderAccessAreas(currentLeaderProfile);
          if (isBreakGlassProfile(currentLeaderProfile)) {
            roleEl.textContent = 'Master password: Home admin only'; // v1.2.58 (D4)
          } else if (getHomeAdminSeats(currentLeaderProfile).length) {
            roleEl.textContent = getLeaderCallingLabels(currentLeaderProfile).title; // v1.2.58: seat callings, e.g. "Bishop"
          } else if (currentLeaderProfile.role === 'admin' || currentLeaderProfile.role === 'bishopric') {
            roleEl.textContent = roleDef.label;
          } else if (areas.length > 0 && areas.length < 7) {
            roleEl.textContent = `${roleDef.label} • ${areas.join(', ')}`;
          } else {
            roleEl.textContent = roleDef.label;
          }
        }
      }
    }

    try { localStorage.setItem('local_ward_leaders', JSON.stringify(leadersCache)); } catch (_) { }
    renderLeadersTable();
  }, (err) => {
    console.error("Firestore ward_leaders error:", err);
    if (isPermissionDenied(err)) { leadersTableDenied = true; showLeadersLoadDenied(); }
    unsubLead = null; // v1.2.71: this listener is dead after an error; resetSubscriptions() + the next sign-in re-create it
  });
}

// ================= CALENDAR RENDERING & ACTIVITY CALENDAR FORMAT =================
let adminCalYear = new Date().getFullYear();
let adminCalMonth = new Date().getMonth(); // 0-indexed

const MONTH_ABBRS = [
  "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
  "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"
];

function getCategoryMeta(cat) {
  const c = (cat || '').toLowerCase().trim();
  if (c === 'bishopric') {
    return { label: 'Bishopric', dot: 'bg-[#8B5CF6]', pill: 'bg-purple-100/80 text-purple-900 border-purple-200/70', badge: 'bg-purple-100 text-purple-800' };
  }
  if (c === 'eq' || c.includes('elder')) {
    return { label: 'EQ', dot: 'bg-[#3B82F6]', pill: 'bg-blue-100/80 text-blue-900 border-blue-200/70', badge: 'bg-blue-100 text-blue-800' };
  }
  if (c === 'rs' || c.includes('relief')) {
    return { label: 'RS', dot: 'bg-[#EC4899]', pill: 'bg-pink-100/80 text-pink-900 border-pink-200/70', badge: 'bg-pink-100 text-pink-800' };
  }
  if (c === 'ss' || c.includes('sunday school') || c === 'sunday') {
    return { label: 'SS', dot: 'bg-[#F59E0B]', pill: 'bg-amber-100/80 text-amber-900 border-amber-200/70', badge: 'bg-amber-100 text-amber-800' };
  }
  if (c === 'youth' || c.includes('combined') || c.includes('primary') || c === 'physical' || c === 'social') {
    return { label: 'Youth', dot: 'bg-[#10B981]', pill: 'bg-emerald-100/80 text-emerald-900 border-emerald-200/70', badge: 'bg-emerald-100 text-emerald-800' };
  }
  return { label: 'Ward', dot: 'bg-[#007B91]', pill: 'bg-teal-100/80 text-teal-900 border-teal-200/70', badge: 'bg-teal-100 text-teal-800' };
}

function renderCalendarGrid() {
  const heading = document.getElementById('admin-calendar-month-heading');
  if (heading) heading.textContent = `${MONTH_NAMES[adminCalMonth]} ${adminCalYear}`;

  const grid = document.getElementById('admin-calendar-days-grid');
  if (!grid) return;
  grid.innerHTML = '';

  const today = new Date();
  const todayDateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const firstDayIdx = new Date(adminCalYear, adminCalMonth, 1).getDay(); // 0 = Sun, 6 = Sat
  const daysInMonth = new Date(adminCalYear, adminCalMonth + 1, 0).getDate();
  const daysInPrevMonth = new Date(adminCalYear, adminCalMonth, 0).getDate();

  const prevMonthYear = adminCalMonth === 0 ? adminCalYear - 1 : adminCalYear;
  const prevMonthIdx = adminCalMonth === 0 ? 11 : adminCalMonth - 1;

  const nextMonthYear = adminCalMonth === 11 ? adminCalYear + 1 : adminCalYear;
  const nextMonthIdx = adminCalMonth === 11 ? 0 : adminCalMonth + 1;

  // 1. Previous Month Overflow Days
  for (let i = firstDayIdx - 1; i >= 0; i--) {
    const dNum = daysInPrevMonth - i;
    const dStr = `${prevMonthYear}-${String(prevMonthIdx + 1).padStart(2, '0')}-${String(dNum).padStart(2, '0')}`;
    const dayEvents = eventsCache.filter(e => (e.date || '').slice(0, 10) === dStr);
    renderAdminDayCell(grid, dNum, dayEvents, false, dStr === todayDateStr, dStr);
  }

  // 2. Current Month Days
  for (let day = 1; day <= daysInMonth; day++) {
    const dStr = `${adminCalYear}-${String(adminCalMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayEvents = eventsCache.filter(e => (e.date || '').slice(0, 10) === dStr);
    renderAdminDayCell(grid, day, dayEvents, true, dStr === todayDateStr, dStr);
  }

  // 3. Next Month Overflow Days to complete 35 or 42 grid cells
  const totalCellsSoFar = firstDayIdx + daysInMonth;
  const totalCellsNeeded = totalCellsSoFar > 35 ? 42 : 35;
  const nextMonthDaysToAdd = totalCellsNeeded - totalCellsSoFar;

  for (let day = 1; day <= nextMonthDaysToAdd; day++) {
    const dStr = `${nextMonthYear}-${String(nextMonthIdx + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayEvents = eventsCache.filter(e => (e.date || '').slice(0, 10) === dStr);
    renderAdminDayCell(grid, day, dayEvents, false, dStr === todayDateStr, dStr);
  }

  renderAdminUpNext();
}

function renderAdminDayCell(grid, dayNum, dayEvents, isCurrentMonth, isToday, dateStr) {
  const cell = document.createElement('div');
  cell.className = `min-h-[125px] sm:min-h-[135px] p-2 border-r border-b border-[#E9DECE] flex flex-col justify-between transition group hover:bg-[#FAF6EF]/70 cursor-pointer ${isToday ? 'border-2 border-[#F59E0B] rounded-lg -m-[1px] relative z-10 bg-amber-50/20' : ''
    } ${!isCurrentMonth ? 'bg-slate-50/40 text-slate-300' : 'bg-white'}`;

  // Top Row: Day Number
  const topRow = document.createElement('div');
  topRow.className = 'flex items-center justify-between';

  const numSpan = document.createElement('span');
  numSpan.className = `text-xs font-semibold ${isToday ? 'text-[#152548] font-bold' : isCurrentMonth ? 'text-[#152548]' : 'text-slate-400'
    }`;
  numSpan.textContent = dayNum;
  topRow.appendChild(numSpan);

  if (dayEvents.length > 0) {
    const countBadge = document.createElement('span');
    countBadge.className = 'text-[10px] font-bold text-slate-400 hidden group-hover:inline';
    countBadge.textContent = `${dayEvents.length} act`;
    topRow.appendChild(countBadge);
  }

  cell.appendChild(topRow);

  // Events Container
  const eventsWrapper = document.createElement('div');
  eventsWrapper.className = 'space-y-1 my-1 flex-1';

  dayEvents.slice(0, 3).forEach(ev => {
    const meta = getCategoryMeta(ev.category || ev.cat);
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = `w-full text-left px-1.5 py-1 rounded text-[10px] font-normal border flex items-start gap-1 transition ${meta.pill} hover:brightness-95 cursor-pointer shadow-2xs`;
    chip.title = `${ev.title || ev.name} (${ev.time || 'All Day'}) - Click to edit`;

    chip.innerHTML = `
      <span class="w-1.5 h-1.5 rounded-full ${meta.dot} shrink-0 mt-0.5"></span>
      <span class="whitespace-normal break-words leading-tight line-clamp-3">${escapeHtml(ev.title || ev.name)}</span>
    `;

    chip.addEventListener('click', (e) => {
      e.stopPropagation();
      openEventModal(ev);
    });

    eventsWrapper.appendChild(chip);
  });

  if (dayEvents.length > 3) {
    const moreChip = document.createElement('span');
    moreChip.className = 'text-[9.5px] font-normal text-slate-500 block px-1 truncate';
    moreChip.textContent = `+${dayEvents.length - 3} more`;
    eventsWrapper.appendChild(moreChip);
  }

  cell.appendChild(eventsWrapper);

  // Cell Click: open day modal if multiple events, or create/edit modal
  cell.addEventListener('click', () => {
    if (dayEvents.length > 1) {
      openDayModal(dateStr, dayEvents);
    } else if (dayEvents.length === 1) {
      openEventModal(dayEvents[0]);
    } else {
      openEventModal({ date: dateStr });
    }
  });

  grid.appendChild(cell);
}

function renderAdminUpNext() {
  const dateBox = document.getElementById('admin-up-next-date-box');
  const monthAbbr = document.getElementById('admin-up-next-month-abbr');
  const dayNum = document.getElementById('admin-up-next-day-num');
  const title = document.getElementById('admin-up-next-title');
  const loc = document.getElementById('admin-up-next-location');
  const time = document.getElementById('admin-up-next-time');
  const editBtn = document.getElementById('btn-admin-edit-up-next');

  if (!title) return;

  const todayStr = new Date().toISOString().slice(0, 10);
  const upcoming = [...eventsCache]
    .filter(e => (e.date || '') >= todayStr && e.published !== false)
    .sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.time || '').localeCompare(b.time || ''));

  const nextEv = upcoming[0] || eventsCache[0];

  if (!nextEv) {
    if (title) title.textContent = "No upcoming activities";
    if (monthAbbr) monthAbbr.textContent = "CAL";
    if (dayNum) dayNum.textContent = "--";
    if (loc) loc.innerHTML = '<span class="text-slate-400">Franklin Stake Center</span>';
    if (time) time.innerHTML = '<span class="text-slate-400">Schedule an activity</span>';
    if (editBtn) {
      editBtn.textContent = "+ Create Event";
      editBtn.onclick = () => openEventModal();
    }
    return;
  }

  // Parse date
  if (nextEv.date) {
    const parts = nextEv.date.split('-');
    if (parts.length === 3) {
      const mIdx = parseInt(parts[1], 10) - 1;
      if (monthAbbr) monthAbbr.textContent = MONTH_ABBRS[mIdx] || 'UP';
      if (dayNum) dayNum.textContent = parseInt(parts[2], 10);
    }
  }

  if (title) title.textContent = nextEv.title || nextEv.name || "Untitled Activity";
  if (loc) loc.innerHTML = `
    <svg class="w-3.5 h-3.5 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
    <span class="truncate">${escapeHtml(nextEv.location || "Franklin Stake Center")}</span>
  `;
  if (time) time.innerHTML = `
    <svg class="w-3.5 h-3.5 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6l4 2"/></svg>
    <span>${escapeHtml(nextEv.time || (nextEv.allDay ? 'All Day' : '7:00 PM'))}</span>
  `;

  if (editBtn) {
    editBtn.innerHTML = '<span>Edit activity</span> <span aria-hidden="true">→</span>';
    editBtn.onclick = () => openEventModal(nextEv);
  }
}

function downloadAdminCalendarICS() {
  if (!eventsCache || eventsCache.length === 0) {
    alert("No calendar events to download.");
    return;
  }
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Blackstone Ward//Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Blackstone Ward Calendar',
    'X-WR-TIMEZONE:America/New_York'
  ];

  eventsCache.forEach(ev => {
    if (!ev.date) return;
    const d = ev.date.replace(/-/g, '');
    let dtStart = d;
    let dtEnd = d;

    if (ev.time) {
      const match = ev.time.match(/(\d{1,2}):(\d{2})/);
      if (match) {
        let h = parseInt(match[1], 10);
        const m = match[2];
        if (ev.time.toLowerCase().includes('pm') && h < 12) h += 12;
        if (ev.time.toLowerCase().includes('am') && h === 12) h = 0;
        const hStr = String(h).padStart(2, '0');
        dtStart = `${d}T${hStr}${m}00`;
        dtEnd = `${d}T${String(h + 1).padStart(2, '0')}${m}00`;
      }
    }
    ics.push(
      'BEGIN:VEVENT',
      `UID:${ev.id || 'ev_' + Date.now() + Math.random()}@blackstoneward.org`,
      `SUMMARY:${(ev.title || ev.name || 'Ward Activity').replace(/,/g, '\\,')}`,
      `DESCRIPTION:${(ev.details || ev.body || '').replace(/\n/g, '\\n')}`,
      `LOCATION:${(ev.location || 'Franklin Stake Center').replace(/,/g, '\\,')}`,
      dtStart.includes('T') ? `DTSTART:${dtStart}` : `DTSTART;VALUE=DATE:${dtStart}`,
      dtEnd.includes('T') ? `DTEND:${dtEnd}` : `DTEND;VALUE=DATE:${dtEnd}`,
      'END:VEVENT'
    );
  });

  ics.push('END:VCALENDAR');
  const blob = new Blob([ics.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `blackstone-ward-calendar-${adminCalYear}.ics`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function renderCalendarList() {
  const container = document.getElementById('events-list-table');
  if (!container) return;
  container.innerHTML = '';

  const sorted = [...eventsCache].sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  if (sorted.length === 0) {
    container.innerHTML = `
      <div class="text-center py-12 text-[#536484] text-xs">
        <p class="font-medium text-sm text-[#152548] mb-1">No ward events scheduled</p>
        <p>Click "+ New Event" to create the first activity for the Ward calendar.</p>
      </div>
    `;
    return;
  }

  sorted.forEach(ev => {
    const row = document.createElement('div');
    row.className = 'flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border border-[#E9DECE] hover:border-[#152548]/30 transition gap-4 bg-slate-50/50';

    const left = document.createElement('div');
    left.className = 'space-y-1';

    const meta = getCategoryMeta(ev.category || ev.cat);
    const catLabel = escapeHtml(ev.category || ev.cat || 'Ward');
    const title = escapeHtml(ev.title || ev.name || 'Untitled Event');
    const dateFormatted = ev.date || 'Date not set';
    const timeFormatted = ev.time || (ev.allDay ? 'All Day' : '');
    const location = ev.location ? `• ${escapeHtml(ev.location)}` : '';
    const pubBadge = ev.published === false ? '<span class="text-[10px] text-red-600 bg-red-100 px-2 py-0.5 rounded font-bold">Unpublished</span>' : '';

    left.innerHTML = `
      <div class="flex items-center gap-2">
        <span class="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${meta.badge}">${catLabel}</span>
        ${pubBadge}
        <h4 class="font-bold text-[#152548] text-sm">${title}</h4>
      </div>
      <p class="text-xs text-[#536484]">${dateFormatted} ${timeFormatted} ${location}</p>
      ${ev.details ? `<p class="text-xs text-slate-600 italic pt-1">${escapeHtml(ev.details)}</p>` : ''}
    `;

    const right = document.createElement('div');
    right.className = 'flex items-center gap-2 self-end sm:self-center';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-[#E9DECE] text-[#152548] hover:bg-slate-100 transition cursor-pointer';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', () => openEventModal(ev));

    right.appendChild(editBtn);
    row.appendChild(left);
    row.appendChild(right);
    container.appendChild(row);
  });
}

// ================= YOUTH HUB TRANSFER WORKFLOW =================
let youthHubEvents = [];
let selectedYouthImportIds = new Set();

async function openYouthImportModal() {
  const modal = document.getElementById('youth-import-modal');
  const listContainer = document.getElementById('youth-import-list');
  const selectAll = document.getElementById('youth-import-select-all');

  if (!modal || !listContainer) return;

  selectedYouthImportIds.clear();
  if (selectAll) selectAll.checked = false;
  updateYouthImportSubmitState();

  listContainer.innerHTML = `
    <div class="p-8 text-center text-xs text-slate-500">
      <svg class="w-6 h-6 animate-spin mx-auto text-emerald-600 mb-2" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path></svg>
      Loading activities from Youth Hub...
    </div>
  `;

  modal.classList.remove('hidden');
  modal.classList.add('flex');

  // If youthHubEvents is empty, attempt a direct fetch from Firestore
  if (youthHubEvents.length === 0) {
    try {
      const snapshot = await getDocs(collection(db, "Combined_events"));
      youthHubEvents = [];
      snapshot.forEach(docSnap => youthHubEvents.push({ id: docSnap.id, ...docSnap.data() }));
    } catch (err) {
      console.warn("Could not fetch Combined_events:", err);
    }
  }

  // Sort upcoming first
  const sorted = [...youthHubEvents]
    .filter(ev => {
      const d = ev.date || (ev.startAt || '').slice(0, 10);
      return Boolean(d);
    })
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  if (sorted.length === 0) {
    listContainer.innerHTML = `
      <div class="p-8 text-center text-xs text-slate-500">
        <p class="font-medium text-[#152548] mb-1">No activities found in Youth Hub</p>
        <p>No events were found in the Youth Hub Combined calendar.</p>
      </div>
    `;
    return;
  }

  listContainer.innerHTML = '';

  sorted.forEach(ev => {
    const evDate = ev.date || (ev.startAt || '').slice(0, 10) || 'Date unset';
    const evTitle = (ev.title || ev.name || 'Untitled Activity').trim();
    const evTime = ev.time || (ev.allDay ? 'All Day' : '');
    const evLoc = ev.location || '';

    // Check if an event with matching title and date is already in eventsCache
    const isAlreadyOnWard = eventsCache.some(w => {
      const wDate = w.date || (w.startAt || '').slice(0, 10);
      const wTitle = (w.title || w.name || '').trim().toLowerCase();
      return (w.sourceYouthId === ev.id) || (wDate === evDate && (wTitle === evTitle.toLowerCase() || wTitle.includes(evTitle.toLowerCase()) || evTitle.toLowerCase().includes(wTitle)));
    });

    const row = document.createElement('label');
    row.className = `flex items-center justify-between p-3.5 hover:bg-slate-50 transition cursor-pointer gap-3 ${isAlreadyOnWard ? 'bg-slate-50/70' : 'bg-white'
      }`;

    const left = document.createElement('div');
    left.className = 'flex items-center gap-3 min-w-0';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'youth-import-checkbox rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer shrink-0';
    checkbox.value = ev.id;
    checkbox.dataset.title = evTitle;
    checkbox.dataset.date = evDate;
    checkbox.dataset.time = evTime;
    checkbox.dataset.location = evLoc;
    checkbox.dataset.details = ev.details || ev.description || '';

    if (isAlreadyOnWard) {
      checkbox.disabled = true;
      checkbox.checked = false;
      checkbox.className += ' opacity-40 cursor-not-allowed';
    } else {
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) selectedYouthImportIds.add(ev.id);
        else selectedYouthImportIds.delete(ev.id);
        updateYouthImportSubmitState();
      });
    }

    left.appendChild(checkbox);

    const info = document.createElement('div');
    info.className = 'min-w-0';
    info.innerHTML = `
      <div class="flex items-center gap-2">
        <span class="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">Youth</span>
        <h5 class="font-bold text-xs text-[#152548] truncate ${isAlreadyOnWard ? 'text-slate-500' : ''}">${escapeHtml(evTitle)}</h5>
      </div>
      <p class="text-[11px] text-slate-500 mt-0.5">${escapeHtml(evDate)}${evTime ? ' • ' + escapeHtml(evTime) : ''}${evLoc ? ' • ' + escapeHtml(evLoc) : ''}</p>
    `;
    left.appendChild(info);

    const right = document.createElement('div');
    right.className = 'shrink-0 text-right';
    if (isAlreadyOnWard) {
      right.innerHTML = '<span class="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded-full border border-slate-200">Already on Ward Cal</span>';
    } else {
      right.innerHTML = '<span class="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-full border border-emerald-200">Available</span>';
    }

    row.appendChild(left);
    row.appendChild(right);
    listContainer.appendChild(row);
  });
}

function updateYouthImportSubmitState() {
  const countSpan = document.getElementById('youth-import-count');
  const submitBtn = document.getElementById('youth-import-submit-btn');
  const submitLabel = document.getElementById('youth-import-submit-label');
  const count = selectedYouthImportIds.size;

  if (countSpan) countSpan.textContent = `${count} ${count === 1 ? 'activity' : 'activities'} selected`;
  if (submitLabel) submitLabel.textContent = `Transfer Selected (${count})`;
  if (submitBtn) submitBtn.disabled = count === 0;
}

async function importSelectedYouthEvents() {
  if (selectedYouthImportIds.size === 0) return;
  const checkboxes = document.querySelectorAll('.youth-import-checkbox:checked');
  let addedCount = 0;

  checkboxes.forEach(cb => {
    const youthId = cb.value;
    const evTitle = cb.dataset.title;
    const evDate = cb.dataset.date;
    const evTime = cb.dataset.time;
    const evLoc = cb.dataset.location;
    const evDetails = cb.dataset.details;

    const newId = `ward_youth_${youthId || Date.now()}_${addedCount}`;
    const { start24, end24 } = parseEventTimes(evTime);
    const isAllDay = !start24;
    const offset = evDate ? getEasternOffset(evDate) : '-05:00';
    const startAt = evDate ? `${evDate}T${isAllDay ? '00:00:00' : start24}${offset}` : null;
    const endAt = evDate ? `${evDate}T${!isAllDay && end24 ? end24 : '23:59:59'}${offset}` : null;
    const formattedTime = isAllDay
      ? ''
      : (end24 ? `${format24To12(start24)} – ${format24To12(end24)}` : format24To12(start24));

    const wardEvent = {
      id: newId,
      title: evTitle,
      date: evDate,
      time: formattedTime || evTime,
      startTime: isAllDay ? '' : start24.slice(0, 5),
      endTime: !isAllDay && end24 ? end24.slice(0, 5) : '',
      startAt: startAt,
      endAt: endAt,
      allDay: isAllDay,
      location: evLoc,
      category: 'Youth',
      details: evDetails,
      published: true,
      sourceYouthId: youthId,
      isWardEvent: true
    };

    eventsCache.push(wardEvent);
    addedCount++;

    // Write to Ward_events in Firestore
    setDoc(doc(db, "Ward_events", newId), wardEvent, { merge: true }).catch(err => {
      console.warn("Ward_events write error:", err);
    });
  });

  try {
    localStorage.setItem('local_ward_events', JSON.stringify(eventsCache));
  } catch (_) { }

  renderCalendarGrid();
  renderCalendarList();
  closeModals();

  alert(`Successfully transferred ${addedCount} youth ${addedCount === 1 ? 'activity' : 'activities'} to the Ward Calendar!`);
}

// ================= DAY MODAL =================
function openDayModal(dateStr, events) {
  const modal = document.getElementById('day-modal');
  const title = document.getElementById('day-modal-title');
  const list = document.getElementById('day-modal-events');
  const addBtn = document.getElementById('day-modal-add-btn');

  const [y, m, d] = dateStr.split('-');
  title.textContent = `${MONTH_NAMES[parseInt(m, 10) - 1]} ${parseInt(d, 10)}, ${y}`;

  list.innerHTML = '';
  if (events.length === 0) {
    list.innerHTML = '<p class="text-xs text-slate-400 italic py-2">No activities scheduled on this day.</p>';
  } else {
    events.forEach(ev => {
      const item = document.createElement('div');
      item.className = 'p-3 rounded-xl border border-[#E9DECE] bg-slate-50 flex items-center justify-between gap-2';
      item.innerHTML = `
        <div>
          <span class="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${getCategoryColor(ev.category || ev.cat)}">${escapeHtml(ev.category || ev.cat || 'Ward')}</span>
          <p class="font-bold text-xs text-[#152548] mt-1">${escapeHtml(ev.title || ev.name)}</p>
          <p class="text-[11px] text-[#536484]">${ev.time ? escapeHtml(ev.time) : (ev.allDay ? 'All Day' : '')} ${ev.location ? '• ' + escapeHtml(ev.location) : ''}</p>
        </div>
      `;
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'text-xs text-[#007B91] hover:underline font-semibold';
      editBtn.textContent = 'Edit';
      editBtn.addEventListener('click', () => {
        closeModals();
        openEventModal(ev);
      });
      item.appendChild(editBtn);
      list.appendChild(item);
    });
  }

  addBtn.onclick = () => {
    closeModals();
    openEventModal({ date: dateStr });
  };

  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

// ================= EVENT MODAL CRUD =================
function openEventModal(eventData = {}) {
  const modal = document.getElementById('event-modal');
  const title = document.getElementById('event-modal-title');
  const delBtn = document.getElementById('event-delete-btn');
  const startTimeInput = document.getElementById('event-time');
  const endTimeInput = document.getElementById('event-end-time');
  const allDayCheckbox = document.getElementById('event-allday');

  const { start24, end24 } = parseEventTimes(eventData.time || '', eventData.startTime || '', eventData.endTime || '');

  document.getElementById('event-id').value = eventData.id || '';
  document.getElementById('event-title').value = eventData.title || eventData.name || '';
  document.getElementById('event-date').value = eventData.date || '';
  if (startTimeInput) startTimeInput.value = start24 ? start24.slice(0, 5) : '';
  if (endTimeInput) endTimeInput.value = end24 ? end24.slice(0, 5) : '';
  if (allDayCheckbox) {
    allDayCheckbox.checked = eventData.allDay === true;
    const syncAllDayState = () => {
      const disabled = allDayCheckbox.checked;
      if (startTimeInput) startTimeInput.disabled = disabled;
      if (endTimeInput) endTimeInput.disabled = disabled;
    };
    syncAllDayState();
    allDayCheckbox.onchange = syncAllDayState;
  }
  document.getElementById('event-location').value = eventData.location || '';
  document.getElementById('event-category').value = eventData.category || eventData.cat || 'Ward';
  document.getElementById('event-details').value = eventData.details || eventData.body || '';
  document.getElementById('event-url').value = eventData.url || '';
  document.getElementById('event-linklabel').value = eventData.linkLabel || '';
  document.getElementById('event-published').checked = eventData.published !== false;

  if (eventData.id) {
    title.textContent = 'Edit Ward Event';
    delBtn.classList.remove('hidden');
    delBtn.onclick = () => deleteEvent(eventData.id);
  } else {
    title.textContent = 'Add Ward Event';
    delBtn.classList.add('hidden');
  }

  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

async function saveEvent() {
  const idInput = document.getElementById('event-id').value;
  const title = document.getElementById('event-title').value.trim();
  const date = document.getElementById('event-date').value;
  const startTimeRaw = document.getElementById('event-time').value.trim();
  const endTimeRaw = (document.getElementById('event-end-time')?.value || '').trim();
  const allDay = document.getElementById('event-allday').checked;
  const location = document.getElementById('event-location').value.trim();
  const category = document.getElementById('event-category').value;
  const details = document.getElementById('event-details').value.trim();
  const url = document.getElementById('event-url').value.trim();
  const linkLabel = document.getElementById('event-linklabel').value.trim();
  const published = document.getElementById('event-published').checked;

  if (!title || !date) {
    alert('Please provide both an event title and a date.');
    return;
  }

  const id = idInput || `event_${date}_${Date.now()}`;
  const { start24, end24 } = parseEventTimes(startTimeRaw, startTimeRaw, endTimeRaw);
  const isAllDay = allDay || !start24;
  const offset = getEasternOffset(date);
  const startAt = `${date}T${isAllDay ? '00:00:00' : start24}${offset}`;
  const endAt = `${date}T${!isAllDay && end24 ? end24 : '23:59:59'}${offset}`;
  const time = isAllDay
    ? ''
    : (end24 ? `${format24To12(start24)} – ${format24To12(end24)}` : format24To12(start24));

  const payload = {
    title,
    name: title,
    date,
    time,
    startTime: isAllDay ? '' : start24.slice(0, 5),
    endTime: !isAllDay && end24 ? end24.slice(0, 5) : '',
    allDay: isAllDay,
    startAt,
    endAt,
    location,
    category,
    cat: category,
    details,
    body: details,
    url,
    linkLabel,
    published,
    type: 'scheduled',
    updatedAt: new Date().toISOString()
  };

  // 1. Immediately store into local eventsCache and localStorage
  const existingIdx = eventsCache.findIndex(e => e.id === id);
  if (existingIdx >= 0) {
    eventsCache[existingIdx] = { id, ...payload };
  } else {
    eventsCache.push({ id, ...payload });
  }
  try {
    localStorage.setItem('local_ward_events', JSON.stringify(eventsCache));
  } catch (_) { }

  // 2. Refresh UI and close modal immediately
  renderCalendarGrid();
  renderCalendarList();
  closeModals();

  // 3. Cloud Firestore persistence (Ward_events only)
  setDoc(doc(db, "Ward_events", id), payload, { merge: true }).catch(err => {
    console.warn("Ward_events cloud sync warning:", err);
  });
}

async function deleteEvent(id) {
  if (!confirm("Are you sure you want to delete this event from the Ward Calendar?")) return;
  eventsCache = eventsCache.filter(e => e.id !== id);
  try {
    localStorage.setItem('local_ward_events', JSON.stringify(eventsCache));
  } catch (_) { }
  renderCalendarGrid();
  renderCalendarList();
  closeModals();

  deleteDoc(doc(db, "Ward_events", id)).catch(() => { });
  // NOTE: Original Youth Hub events in Combined_events are NEVER deleted
}

// ================= ANNOUNCEMENTS CRUD =================
function renderAnnouncements() {
  const container = document.getElementById('announcements-container');
  container.innerHTML = '';

  if (announcementsCache.length === 0) {
    container.innerHTML = `
      <div class="text-center py-12 text-[#536484] text-xs">
        <p class="font-medium text-sm text-[#152548] mb-1">No announcements posted</p>
        <p>Click "+ New Announcement" to post a ward announcement to the homepage.</p>
      </div>
    `;
    return;
  }

  announcementsCache.forEach(item => {
    const card = document.createElement('div');
    card.className = 'p-5 rounded-2xl border border-[#E9DECE] bg-white hover:border-[#152548]/30 transition shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4';

    const left = document.createElement('div');
    left.className = 'space-y-1.5';

    const pinnedBadge = item.pinned
      ? '<span class="text-[10px] font-bold uppercase tracking-wider text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">Featured / Pinned</span>'
      : '';
    const pubBadge = item.published === false
      ? '<span class="text-[10px] font-bold uppercase tracking-wider text-red-600 bg-red-100 px-2 py-0.5 rounded-full">Draft</span>'
      : '';

    left.innerHTML = `
      <div class="flex items-center gap-2">
        ${pinnedBadge}
        ${pubBadge}
        <h4 class="font-bold text-[#152548] text-base">${escapeHtml(item.title)}</h4>
      </div>
      <p class="text-xs text-slate-600 leading-relaxed">${escapeHtml(item.body || item.details || '')}</p>
      ${item.url ? `<a href="${escapeHtml(item.url)}" target="_blank" rel="noopener" class="inline-block text-xs text-[#007B91] hover:underline font-semibold pt-1">${escapeHtml(item.linkLabel || 'Learn more →')}</a>` : ''}
    `;

    const right = document.createElement('div');
    right.className = 'flex items-center gap-2 self-end md:self-center';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-[#E9DECE] text-[#152548] hover:bg-slate-100 transition';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', () => openAnnouncementModal(item));

    right.appendChild(editBtn);
    card.appendChild(left);
    card.appendChild(right);
    container.appendChild(card);
  });
}

function openAnnouncementModal(annData = {}) {
  const modal = document.getElementById('announcement-modal');
  const title = document.getElementById('announcement-modal-title');
  const delBtn = document.getElementById('ann-delete-btn');

  document.getElementById('ann-id').value = annData.id || '';
  document.getElementById('ann-title').value = annData.title || '';
  document.getElementById('ann-body').value = annData.body || annData.details || '';
  document.getElementById('ann-url').value = annData.url || '';
  document.getElementById('ann-linklabel').value = annData.linkLabel || '';
  document.getElementById('ann-pinned').checked = annData.pinned === true;
  document.getElementById('ann-published').checked = annData.published !== false;

  if (annData.id) {
    title.textContent = 'Edit Ward Announcement';
    delBtn.classList.remove('hidden');
    delBtn.onclick = () => deleteAnnouncement(annData.id);
  } else {
    title.textContent = 'Add Ward Announcement';
    delBtn.classList.add('hidden');
  }

  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

async function saveAnnouncement() {
  const idInput = document.getElementById('ann-id').value;
  const title = document.getElementById('ann-title').value.trim();
  const body = document.getElementById('ann-body').value.trim();
  const url = document.getElementById('ann-url').value.trim();
  const linkLabel = document.getElementById('ann-linklabel').value.trim();
  const pinned = document.getElementById('ann-pinned').checked;
  const published = document.getElementById('ann-published').checked;

  if (!title || !body) {
    alert('Please provide both an announcement title and message body.');
    return;
  }

  const id = idInput || `ann_${Date.now()}`;
  const payload = {
    title,
    body,
    details: body,
    url,
    linkLabel: linkLabel || (url ? 'Learn more →' : ''),
    pinned,
    published,
    publishAt: new Date().toISOString(),
    timestamp: Date.now()
  };

  // 1. Immediately store into local announcementsCache and localStorage
  const existingIdx = announcementsCache.findIndex(a => a.id === id);
  if (existingIdx >= 0) {
    announcementsCache[existingIdx] = { id, ...payload };
  } else {
    announcementsCache.unshift({ id, ...payload });
  }
  try {
    localStorage.setItem('local_ward_announcements', JSON.stringify(announcementsCache));
  } catch (_) { }

  // 2. Refresh UI and close modal immediately
  renderAnnouncements();
  closeModals();

  // 3. Cloud persistence (Dual write)
  setDoc(doc(db, "ward_announcements", id), payload, { merge: true }).catch(err => {
    console.warn("ward_announcements cloud warning:", err);
  });
  setDoc(doc(db, "home_announcements", id), { ...payload, org: 'Ward' }, { merge: true }).catch(err => {
    console.warn("home_announcements cloud warning:", err);
    alertContentWriteDenied(err); // v1.2.69
  });
}

async function deleteAnnouncement(id) {
  if (!confirm("Are you sure you want to delete this announcement?")) return;
  announcementsCache = announcementsCache.filter(a => a.id !== id);
  try {
    localStorage.setItem('local_ward_announcements', JSON.stringify(announcementsCache));
  } catch (_) { }
  renderAnnouncements();
  closeModals();

  deleteDoc(doc(db, "ward_announcements", id)).catch(() => { });
  deleteDoc(doc(db, "home_announcements", id)).catch((e) => { alertContentWriteDenied(e); }); // v1.2.69
}

// ================= SPOTLIGHTS CRUD =================
function renderSpotlights() {
  const container = document.getElementById('spotlights-container');
  container.innerHTML = '';

  if (spotlightsCache.length === 0) {
    container.innerHTML = `
      <div class="col-span-full text-center py-12 text-[#536484] text-xs">
        <p class="font-medium text-sm text-[#152548] mb-1">No ward spotlights posted</p>
        <p>Click "+ New Spotlight" to create member and family spotlights for the Ward Spotlights page.</p>
      </div>
    `;
    return;
  }

  spotlightsCache.forEach(item => {
    const card = document.createElement('div');
    card.className = 'bg-white border border-[#E9DECE] rounded-2xl overflow-hidden shadow-xs hover:shadow-md transition flex flex-col justify-between';

    const top = document.createElement('div');
    top.className = 'p-5 space-y-3';

    const photoHtml = item.image || item.photoUrl
      ? `<img src="${escapeHtml(item.image || item.photoUrl)}" alt="${escapeHtml(item.name)}" class="w-full h-44 object-cover rounded-xl mb-3">`
      : `<div class="w-full h-32 bg-slate-100 rounded-xl flex items-center justify-center text-slate-400 text-xs mb-3">No photo provided</div>`;

    const name = escapeHtml(item.name || 'Unnamed Spotlight');
    const calling = escapeHtml(item.calling || item.role || item.group || 'Ward Member');
    const desc = escapeHtml((item.desc || item.bio || item.story || '').slice(0, 140)) + '...';
    const sort = item.sortOrder || 1;

    top.innerHTML = `
      ${photoHtml}
      <div class="flex items-center justify-between">
        <span class="text-[10px] uppercase font-bold tracking-wider text-[#A74319] bg-[#A74319]/10 px-2 py-0.5 rounded-full">${calling}</span>
        <span class="text-[10px] text-[#536484] font-mono">Order: #${sort}</span>
      </div>
      <h4 class="font-bold text-[#152548] text-base">${name}</h4>
      <p class="text-xs text-slate-600 leading-relaxed">${desc}</p>
    `;

    const bottom = document.createElement('div');
    bottom.className = 'p-4 border-t border-[#E9DECE] bg-slate-50/50 flex items-center justify-end';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-[#E9DECE] text-[#152548] hover:bg-slate-100 transition';
    editBtn.textContent = 'Edit Spotlight';
    editBtn.addEventListener('click', () => openSpotlightModal(item));

    bottom.appendChild(editBtn);
    card.appendChild(top);
    card.appendChild(bottom);
    container.appendChild(card);
  });
}

function openSpotlightModal(spotData = {}) {
  const modal = document.getElementById('spotlight-modal');
  const title = document.getElementById('spotlight-modal-title');
  const delBtn = document.getElementById('spot-delete-btn');

  document.getElementById('spot-id').value = spotData.id || '';
  document.getElementById('spot-name').value = spotData.name || '';
  document.getElementById('spot-calling').value = spotData.calling || spotData.role || spotData.group || '';
  document.getElementById('spot-order').value = spotData.sortOrder || (spotlightsCache.length + 1);
  document.getElementById('spot-image').value = spotData.image || spotData.photoUrl || '';
  document.getElementById('spot-desc').value = spotData.desc || spotData.bio || spotData.story || '';
  document.getElementById('spot-published').checked = spotData.published !== false;

  if (spotData.id) {
    title.textContent = 'Edit Ward Spotlight';
    delBtn.classList.remove('hidden');
    delBtn.onclick = () => deleteSpotlight(spotData.id);
  } else {
    title.textContent = 'Add Ward Spotlight';
    delBtn.classList.add('hidden');
  }

  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

async function saveSpotlight() {
  const idInput = document.getElementById('spot-id').value;
  const name = document.getElementById('spot-name').value.trim();
  const calling = document.getElementById('spot-calling').value.trim();
  const sortOrder = parseInt(document.getElementById('spot-order').value, 10) || 1;
  const image = document.getElementById('spot-image').value.trim();
  const desc = document.getElementById('spot-desc').value.trim();
  const published = document.getElementById('spot-published').checked;

  if (!name || !desc) {
    alert('Please provide both the spotlight name and bio/story.');
    return;
  }

  const id = idInput || `spot_${Date.now()}`;
  const payload = {
    name,
    calling,
    role: calling,
    group: calling,
    sortOrder,
    image,
    photoUrl: image,
    desc,
    bio: desc,
    story: desc,
    published,
    updatedAt: new Date().toISOString()
  };

  // 1. Immediately store into local spotlightsCache and localStorage
  const existingIdx = spotlightsCache.findIndex(s => s.id === id);
  if (existingIdx >= 0) {
    spotlightsCache[existingIdx] = { id, ...payload };
  } else {
    spotlightsCache.push({ id, ...payload });
  }
  try {
    localStorage.setItem('local_ward_spotlights', JSON.stringify(spotlightsCache));
  } catch (_) { }

  // 2. Refresh UI and close modal immediately
  renderSpotlights();
  closeModals();

  // 3. Cloud persistence (Dual write)
  setDoc(doc(db, "ward_spotlights", id), payload, { merge: true }).catch(err => {
    console.warn("ward_spotlights cloud warning:", err);
  });
  setDoc(doc(db, "home_spotlights", id), { ...payload, org: 'Ward' }, { merge: true }).catch(err => {
    console.warn("home_spotlights cloud warning:", err);
    alertContentWriteDenied(err); // v1.2.69
  });
}

async function deleteSpotlight(id) {
  if (!confirm("Are you sure you want to delete this spotlight?")) return;
  spotlightsCache = spotlightsCache.filter(s => s.id !== id);
  try {
    localStorage.setItem('local_ward_spotlights', JSON.stringify(spotlightsCache));
  } catch (_) { }
  renderSpotlights();
  closeModals();

  deleteDoc(doc(db, "ward_spotlights", id)).catch(() => { });
  deleteDoc(doc(db, "home_spotlights", id)).catch((e) => { alertContentWriteDenied(e); }); // v1.2.69
}

// ================= LEADERS (RBAC) CONTROLS =================
let selectedLeaderIds = new Set();

function updateLeadersBulkBar() {
  const bulkBar = document.getElementById('leaders-bulk-bar');
  const countSpan = document.getElementById('bulk-selected-count');
  const selectAll = document.getElementById('select-all-leaders');
  if (!bulkBar) return;

  const selectableRows = document.querySelectorAll('.leader-row-check');
  const totalSelectable = selectableRows.length;
  const canBulk = canUserAddLeader();

  if (selectedLeaderIds.size > 0 && canBulk) {
    bulkBar.classList.remove('hidden');
    bulkBar.classList.add('flex');
    if (countSpan) countSpan.textContent = `${selectedLeaderIds.size} leader${selectedLeaderIds.size === 1 ? '' : 's'} selected`;
  } else {
    bulkBar.classList.add('hidden');
    bulkBar.classList.remove('flex');
  }

  if (selectAll) {
    if (totalSelectable === 0 || !canBulk) {
      selectAll.checked = false;
      selectAll.indeterminate = false;
      selectAll.disabled = true;
    } else {
      selectAll.disabled = false;
      selectAll.checked = totalSelectable > 0 && selectedLeaderIds.size === totalSelectable;
      selectAll.indeterminate = selectedLeaderIds.size > 0 && selectedLeaderIds.size < totalSelectable;
    }
  }
}

let currentLeaderOrgTab = 'all'; // 'all', 'bishopric', 'youth', 'eq', 'rs', 'ss'
let isAccessMatrixVisible = false;

// v1.2.56 (Duane, 2026-11-21): Access Matrix = one row per Permissions-v3.xlsx Roles row with a single
// "Accessible Areas" column (area ids joined by " • ") instead of one icon column per area.
const MATRIX_AREA_SEP = ' • ';
function getPermissionAreaLabel(id) {
  const a = PERMISSIONS_AREAS[id];
  if (!a) return `Area ${id}`;
  return `Area ${id}: ${a[0]}${a[1] ? ' — ' + a[1] : ''}${a[2] && a[2] !== 'Active' ? ' (' + a[2] + ')' : ''}`;
}
function formatAccessibleAreas(areaIds) {
  return areaIds && areaIds.length ? areaIds.join(MATRIX_AREA_SEP) : '—';
}

// v1.2.56: Add Calling / Edit is limited to RC1 (Web Administrator) and RC2 (Bishop).
// v1.2.61: only those two seats, resolved from rcCodes through the Access module
// (Access.rcCodesFor, including the D3 owner fallback). No admin-role shortcut.
function canManageCallings() {
  if (!currentLeaderProfile) return false;
  const seats = Access.rcCodesFor(currentLeaderProfile, { owner: HOME_ADMIN_OWNER });
  return seats.includes('RC1') || seats.includes('RC2');
}

function renderAccessMatrixTable() {
  const tbody = document.getElementById('access-matrix-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';
  const canManage = canManageCallings();
  const addBtn = document.getElementById('btn-add-calling');
  if (addBtn) addBtn.classList.toggle('hidden', !canManage);

  // One row per Roles row (RC1-RC52, sheet order); a reference, independent of users.
  PERMISSIONS_ROLES.forEach(([rc, name, label, orgCodes, areaIds]) => {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-slate-50/80 transition';
    const areasTitle = areaIds.map(getPermissionAreaLabel).join('\n');
    const actionHtml = canManage
      ? `<button type="button" class="btn-edit-calling px-2.5 py-1 bg-white border border-[#E9DECE] hover:border-[#152548] rounded-lg text-[11px] font-semibold text-[#152548] inline-flex items-center gap-1 shadow-2xs transition cursor-pointer" data-rc="${escapeHtml(rc)}" aria-label="Edit ${escapeHtml(label)}"><svg class="w-3 h-3 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg><span>Edit</span></button>`
      : '<span class="text-slate-300">—</span>';
    tr.innerHTML = `
      <td class="w-14 min-w-[3.5rem] px-3 py-2 font-mono text-[11px] text-slate-600">${escapeHtml(rc)}</td>
      <td class="px-3 py-2 font-semibold text-[#152548] text-xs whitespace-nowrap"><span class="cursor-help" title="${escapeHtml(name)}">${escapeHtml(label)}</span></td>
      <td class="w-px px-2 py-2 text-[11px] text-slate-600 font-medium whitespace-nowrap">${renderOrgCodes(splitOrgCodes(orgCodes))}</td>
      <td class="px-3 py-2 font-mono text-[11px] text-slate-700" title="${escapeHtml(areasTitle)}">${escapeHtml(formatAccessibleAreas(areaIds))}</td>
      <td class="px-3 py-2 text-right">${actionHtml}</td>
    `;
    tbody.appendChild(tr);
  });
}

// v1.2.56: "i" next to "Accessible Areas" opens the Restricted Areas tab of the sheet (id, site, section, status).
function renderRestrictedAreasTable() {
  const tbody = document.getElementById('restricted-areas-body');
  if (!tbody) return;
  tbody.innerHTML = Object.entries(PERMISSIONS_AREAS).map(([id, [site, region, status]]) => `
    <tr>
      <td class="px-3 py-1.5 font-mono text-slate-600">${escapeHtml(id)}</td>
      <td class="px-3 py-1.5 text-[#152548] font-medium">${escapeHtml(site)}</td>
      <td class="px-3 py-1.5 text-slate-600">${escapeHtml(region || '—')}</td>
      <td class="px-3 py-1.5"><span class="inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold ${status === 'Active' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-slate-100 text-slate-600 border border-slate-200'}">${escapeHtml(status)}</span></td>
    </tr>`).join('');
}
function openRestrictedAreasModal() {
  renderRestrictedAreasTable();
  const modal = document.getElementById('restricted-areas-modal');
  if (!modal) return;
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

// v1.2.67: Add Calling / Edit window. Save writes ward_permissions_roles/<RC> (and meta/history)
// in a transaction. Copy row / Download CSV stay available if the write is denied (rules not deployed).
let callingModalRc = null; // null = adding a new calling
function nextCallingRc() {
  const max = Math.max(0, ...PERMISSIONS_ROLES.map(r => Number(String(r[0]).replace(/^RC/, '')) || 0));
  return `RC${max + 1}`;
}
function buildCallingModalChoices() {
  const orgBox = document.getElementById('calling-orgs');
  if (orgBox && !orgBox.dataset.built) {
    orgBox.innerHTML = Object.entries(PERMISSIONS_ORGS).map(([code, orgName]) => `
      <label class="flex items-center gap-1.5 text-xs text-[#152548] cursor-pointer" title="${escapeHtml(orgName)}">
        <input type="checkbox" class="calling-org-check rounded border-[#E9DECE] text-[#152548] focus:ring-0" value="${escapeHtml(code)}">
        <span><span class="font-mono font-bold">${escapeHtml(code)}</span> ${escapeHtml(orgName)}</span>
      </label>`).join('');
    orgBox.dataset.built = '1';
  }
  const areaBox = document.getElementById('calling-areas');
  if (areaBox && !areaBox.dataset.built) {
    areaBox.innerHTML = Object.keys(PERMISSIONS_AREAS).map(id => `
      <label class="flex items-center gap-1.5 text-xs text-[#152548] cursor-pointer" title="${escapeHtml(getPermissionAreaLabel(Number(id)))}">
        <input type="checkbox" class="calling-area-check rounded border-[#E9DECE] text-[#152548] focus:ring-0" value="${escapeHtml(id)}">
        <span class="font-mono">${escapeHtml(id)}</span>
      </label>`).join('');
    areaBox.dataset.built = '1';
  }
}
function setCallingModalStatus(msg, isError) {
  const el = document.getElementById('calling-modal-status');
  if (!el) return;
  el.textContent = msg || '';
  el.className = `text-[11px] font-medium min-h-[1rem] ${isError ? 'text-red-600' : 'text-emerald-700'}`;
}
function openCallingModal(rc) {
  if (!canManageCallings()) {
    alert('Only the Web Administrator or the Bishop can add or edit callings.');
    return;
  }
  buildCallingModalChoices();
  const row = rc ? PERMISSIONS_ROLES.find(r => r[0] === rc) : null;
  callingModalRc = row ? row[0] : null;
  const title = document.getElementById('calling-modal-title');
  if (title) title.textContent = row ? `Edit Calling: ${row[2]}` : 'Add Calling';
  const rcInput = document.getElementById('calling-rc');
  if (rcInput) {
    rcInput.value = row ? row[0] : nextCallingRc();
    rcInput.readOnly = !!row;
  }
  document.getElementById('calling-name').value = row ? row[1] : '';
  document.getElementById('calling-label').value = row ? row[2] : '';
  const orgs = row ? splitOrgCodes(row[3]) : [];
  document.querySelectorAll('.calling-org-check').forEach(chk => { chk.checked = orgs.includes(chk.value); });
  const areas = row ? row[4] : [];
  document.querySelectorAll('.calling-area-check').forEach(chk => { chk.checked = areas.includes(Number(chk.value)); });
  setCallingModalStatus('', false);
  const modal = document.getElementById('calling-modal');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}
// Reads and checks the form. Returns { row } shaped like PERMISSIONS_ROLES, or { error }.
function readCallingForm() {
  const rc = (document.getElementById('calling-rc')?.value || '').trim().toUpperCase();
  const name = (document.getElementById('calling-name')?.value || '').trim();
  const label = (document.getElementById('calling-label')?.value || '').trim();
  const orgs = [...document.querySelectorAll('.calling-org-check:checked')].map(chk => chk.value);
  const areas = [...document.querySelectorAll('.calling-area-check:checked')].map(chk => Number(chk.value)).sort((a, b) => a - b);
  if (!/^RC\d+$/.test(rc)) return { error: 'RC code must look like RC53.' };
  if (!callingModalRc && PERMISSIONS_ROLES.some(r => r[0] === rc)) return { error: `${rc} already exists. Use Edit on that row instead.` };
  if (!name) return { error: 'Enter the full calling name (Roles & Callings).' };
  if (!label) return { error: 'Enter the short Calling Label.' };
  if (!orgs.length) return { error: 'Pick at least one organization.' };
  return { row: [rc, name, label, orgs.join(', '), areas] };
}
function csvCell(v) {
  const t = String(v === null || v === undefined ? '' : v);
  return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}
// Same columns as the Roles tab without Current User (no member names): ID, Roles & Callings, Calling Label, Org, Areas.
const CALLING_EXPORT_HEADER = ['ID', 'Roles & Callings', 'Calling Label', 'Org', 'Access to following restricted areas'];
function callingRowToCsv(row) {
  return [row[0], row[1], row[2], row[3], row[4].join(', ')].map(csvCell).join(',');
}
function buildCallingsCsv(edited) {
  const rows = PERMISSIONS_ROLES.map(r => (edited && r[0] === edited[0]) ? edited : r);
  if (edited && !PERMISSIONS_ROLES.some(r => r[0] === edited[0])) rows.push(edited);
  return [CALLING_EXPORT_HEADER.map(csvCell).join(','), ...rows.map(callingRowToCsv)].join('\n') + '\n';
}
async function copyCallingRow() {
  if (!canManageCallings()) {
    setCallingModalStatus('Only the Web Administrator or the Bishop can add or edit callings.', true);
    return;
  }
  const res = readCallingForm();
  if (res.error) { setCallingModalStatus(res.error, true); return; }
  const text = callingRowToCsv(res.row);
  try {
    await navigator.clipboard.writeText(text);
  } catch (_) {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (_e) { }
    ta.remove();
  }
  setCallingModalStatus(`Copied ${res.row[0]} (not saved online). Paste it into Permissions_v6.xlsx.`, false);
}
function downloadCallingsCsv() {
  if (!canManageCallings()) {
    setCallingModalStatus('Only the Web Administrator or the Bishop can add or edit callings.', true);
    return;
  }
  const res = readCallingForm();
  if (res.error) { setCallingModalStatus(res.error, true); return; }
  const blob = new Blob([buildCallingsCsv(res.row)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Permissions-Roles-${res.row[0]}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  setCallingModalStatus(`Downloaded the Roles CSV with ${res.row[0]} (not saved online).`, false);
}

const CALLING_SAVE_NOT_SIGNED_IN_MSG = "You're not signed in to Firebase. Use Sign In with Touch ID / Face ID, then try Save again.";
const CALLING_SAVE_NEEDS_PASSKEY_MSG = "Saving the Access Matrix requires a passkey session. Sign in with Touch ID / Face ID, then try again.";
const CALLING_SAVE_NOT_PERMITTED_MSG = "You don't have permission to save callings (need an active Web Administrator or Bishop passkey). This was not a missing rules deploy.";

function callingSaveDeniedMessage(reason) {
  if (reason === 'no-auth') return CALLING_SAVE_NOT_SIGNED_IN_MSG;
  if (reason === 'needs-passkey') return CALLING_SAVE_NEEDS_PASSKEY_MSG;
  return CALLING_SAVE_NOT_PERMITTED_MSG;
}

async function callingSaveAuthState() {
  const user = auth.currentUser;
  if (!user) {
    console.info('Calling save auth', { uid: '', provider: '' });
    return { ok: false, reason: 'no-auth', uid: '', provider: '' };
  }
  let provider = '';
  try {
    const tokenResult = await user.getIdTokenResult();
    provider = tokenResult.signInProvider
      || (tokenResult.claims && tokenResult.claims.firebase && tokenResult.claims.firebase.sign_in_provider)
      || '';
  } catch (_) {
    console.info('Calling save auth', { uid: user.uid || '', provider: '' });
    return { ok: false, reason: 'no-auth', uid: user.uid || '', provider: '' };
  }
  const profileId = (currentLeaderProfile && currentLeaderProfile.id) || '';
  console.info('Calling save auth', { uid: user.uid, provider });
  if (provider !== 'custom') {
    return { ok: false, reason: 'needs-passkey', uid: user.uid, provider };
  }
  if (!profileId || user.uid !== profileId) {
    return { ok: false, reason: 'not-permitted', uid: user.uid, provider };
  }
  return { ok: true, reason: '', uid: user.uid, provider };
}


function upsertCatalogRole(fields) {
  const roles = (callingCatalog?.roles || []).filter((r) => r && r.rc !== fields.rc);
  roles.push({
    rc: fields.rc,
    name: fields.name,
    label: fields.label,
    org: fields.org,
    dropdownOrgs: fields.dropdownOrgs || fields.org,
    displayOrder: fields.displayOrder,
    areas: fields.areas,
    homeSeat: !!fields.homeSeat,
    youthAreaNames: fields.youthAreaNames || [],
    legacyRole: fields.legacyRole,
    legacyOrg: fields.legacyOrg,
    active: fields.active !== false
  });
  const groups = recomputeGroups(PERMISSIONS_ORGS, roles);
  applyCallingCatalog({ ...(callingCatalog || {}), groups, roles, source: (callingCatalog && callingCatalog.source) || 'bundled' });
}

async function writeCallingToFirestore(edit, isNew) {
  const roleRef = doc(db, 'ward_permissions_roles', edit.rc);
  const metaRef = doc(db, 'ward_permissions_meta', 'current');
  const historyRef = doc(collection(db, 'ward_permissions_history'));
  const editorId = (currentLeaderProfile && currentLeaderProfile.id) || (auth.currentUser && auth.currentUser.uid) || '';
  let savedFields = null;
  await runTransaction(db, async (tx) => {
    const roleSnap = await tx.get(roleRef);
    const metaSnap = await tx.get(metaRef);
    if (isNew && roleSnap.exists()) {
      throw new Error(`${edit.rc} already exists. Use Edit on that row instead.`);
    }
    if (!isNew && !roleSnap.exists()) {
      throw new Error(`${edit.rc} was not found online. Try Download CSV.`);
    }
    const existing = roleSnap.exists() ? roleSnap.data() : null;
    const fields = buildRoleDocFields(edit, Access.PERMISSIONS, Access.roleForAreas, existing);
    savedFields = fields;
    const payload = {
      ...fields,
      updatedAt: serverTimestamp(),
      updatedBy: editorId
    };
    if (isNew) payload.createdAt = serverTimestamp();
    const meta = metaSnap.exists() ? (metaSnap.data() || {}) : {};
    const roleIds = Array.isArray(meta.roleIds) ? [...meta.roleIds] : (callingCatalog?.roles || []).map((r) => r.rc);
    if (!roleIds.includes(edit.rc)) roleIds.push(edit.rc);
    roleIds.sort((a, b) => rcSeq(a) - rcSeq(b));
    const catalogRoles = (callingCatalog?.roles || []).filter((r) => r && r.rc !== fields.rc).concat([{ ...fields, active: fields.active !== false }]);
    const metaPatch = {
      roleIds,
      roleCount: roleIds.length,
      groups: recomputeGroups(meta.orgs || PERMISSIONS_ORGS, catalogRoles),
      updatedAt: serverTimestamp(),
      updatedBy: editorId
    };
    tx.set(roleRef, payload, { merge: true });
    tx.set(metaRef, metaPatch, { merge: true });
    tx.set(historyRef, {
      schemaVersion: 1,
      action: isNew ? 'add' : 'update',
      rc: edit.rc,
      before: existing || null,
      after: fields,
      by: editorId,
      at: serverTimestamp()
    });
  });
  return savedFields;
}

async function saveCallingOnline() {
  if (!canManageCallings()) {
    setCallingModalStatus('Only the Web Administrator or the Bishop can add or edit callings.', true);
    return;
  }
  const res = readCallingForm();
  if (res.error) { setCallingModalStatus(res.error, true); return; }
  const [rc, name, label, orgText, areas] = res.row;
  const orgs = splitOrgCodes(orgText);
  const isNew = !callingModalRc;
  const btn = document.getElementById('calling-save-btn');
  if (btn) btn.disabled = true;
  const authState = await callingSaveAuthState();
  if (!authState.ok) {
    setCallingModalStatus(callingSaveDeniedMessage(authState.reason), true);
    if (btn) btn.disabled = false;
    return;
  }
  setCallingModalStatus('Saving…', false);
  try {
    const fields = await writeCallingToFirestore({ rc, name, label, org: orgs, areas }, isNew);
    callingModalRc = rc;
    const rcInput = document.getElementById('calling-rc');
    if (rcInput) rcInput.readOnly = true;
    upsertCatalogRole(fields);
    const title = document.getElementById('calling-modal-title');
    if (title) title.textContent = `Edit Calling: ${label}`;
    renderAccessMatrixTable();
    const select = document.getElementById('leader-calling');
    const current = select ? (select.value || select.dataset.originalCalling || '') : '';
    renderCallingOptions(current);
    setCallingModalStatus(`Saved ${rc} online.`, false);
    loadCallingCatalog();
  } catch (err) {
    if (isPermissionDenied(err)) {
      const user = auth.currentUser;
      let reason = 'no-auth';
      if (!user) {
        console.info('Calling save denied', { uid: '', provider: '' });
      } else {
        let provider = '';
        try {
          const tokenResult = await user.getIdTokenResult();
          provider = tokenResult.signInProvider
            || (tokenResult.claims && tokenResult.claims.firebase && tokenResult.claims.firebase.sign_in_provider)
            || '';
        } catch (_) { }
        console.info('Calling save denied', { uid: user.uid, provider });
        reason = (provider === 'custom') ? 'not-permitted' : 'needs-passkey';
      }
      setCallingModalStatus(callingSaveDeniedMessage(reason), true);
    } else {
      setCallingModalStatus((err && err.message) || 'Could not save the calling online.', true);
    }
  } finally {
    if (btn) btn.disabled = false;
  }
}

function syncCallingAccessModal(callingName, customAccess = null) {
  const def = getCallingDef(callingName);
  // v1.2.57: a Home seat pre-selects the Youth areas of its master-sheet row.
  const seatRc = Object.keys(HOME_ADMIN_SEATS).find(rc => HOME_ADMIN_SEATS[rc] === callingName) || HOME_ADMIN_LEGACY_CALLINGS[callingName];
  const seatYouth = seatRc ? youthAreaNamesFromIds(getRcAreaUnion([seatRc])) : null;
  const targetAreas = customAccess !== null ? customAccess : (seatYouth || (def ? def.defaultAccess : []));
  const checks = document.querySelectorAll('.youth-area-check');
  checks.forEach(chk => {
    chk.checked = targetAreas.includes(chk.value);
  });
  const hint = document.getElementById('youth-access-hint');
  if (hint) {
    if (seatYouth && seatYouth.length < YOUTH_ADMIN_AREAS.length) {
      hint.textContent = `${callingName} has no Youth Hub admin access in the master sheet (areas ${getRcAreaUnion([seatRc]).join(', ')}).`;
      hint.className = 'text-[11px] text-slate-500 italic mt-1';
    } else if (callingName === 'Bishopric' || Object.values(HOME_ADMIN_SEATS).includes(callingName)) {
      hint.textContent = 'Bishopric seats have full read/write access to all 7 Youth Hub admin areas.';
      hint.className = 'text-[11px] text-emerald-700 font-medium italic mt-1';
    } else if (def && def.activeOnYouth) {
      hint.textContent = `Active on Youth Hub: Default read/write access for ${callingName} pre-selected.`;
      hint.className = 'text-[11px] text-blue-700 font-medium italic mt-1';
    } else {
      hint.textContent = 'Ward Portal role. Inactive on Youth Hub (permissions can be customized or pre-configured).';
      hint.className = 'text-[11px] text-slate-500 italic mt-1';
    }
  }
}

// v1.2.56: switch the Users & Access section between its two tabs.
const LEADERS_VIEW_TAB_ON = 'leaders-view-tab px-4 py-2 -mb-px border-b-2 border-[#152548] text-[#152548] font-bold text-xs flex items-center gap-1.5 transition cursor-pointer';
const LEADERS_VIEW_TAB_OFF = 'leaders-view-tab px-4 py-2 -mb-px border-b-2 border-transparent text-slate-500 hover:text-[#152548] font-semibold text-xs flex items-center gap-1.5 transition cursor-pointer';
function setLeadersView(view) {
  isAccessMatrixVisible = view === 'matrix';
  const usersPanel = document.getElementById('leaders-users-panel');
  const matrixPanel = document.getElementById('leaders-access-matrix-panel');
  if (usersPanel) usersPanel.classList.toggle('hidden', isAccessMatrixVisible);
  if (matrixPanel) matrixPanel.classList.toggle('hidden', !isAccessMatrixVisible);
  const addLeaderBtn = document.getElementById('btn-add-leader');
  if (addLeaderBtn) addLeaderBtn.classList.toggle('hidden', isAccessMatrixVisible || !canUserAddLeader());
  [['tab-view-users', !isAccessMatrixVisible], ['btn-toggle-access-matrix', isAccessMatrixVisible]].forEach(([id, on]) => {
    const b = document.getElementById(id);
    if (!b) return;
    b.className = on ? LEADERS_VIEW_TAB_ON : LEADERS_VIEW_TAB_OFF;
    b.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  if (isAccessMatrixVisible) renderAccessMatrixTable();
}

function initLeaderOrgTabs() {
  const tabs = document.querySelectorAll('.leader-org-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const org = tab.getAttribute('data-org');
      if (!org) return;
      currentLeaderOrgTab = org;

      // Update tab styles
      tabs.forEach(t => {
        const isCurrent = t.getAttribute('data-org') === org;
        const countSpan = t.querySelector('span[id^="count-leaders-"]');
        if (isCurrent) {
          t.className = 'leader-org-tab active px-3 py-1.5 rounded-lg text-xs font-bold transition bg-[#152548] text-white flex items-center gap-1.5 shadow-2xs cursor-pointer';
          if (countSpan) countSpan.className = 'text-[10px] font-bold bg-white/20 text-white px-1.5 py-0.2 rounded-full';
        } else {
          t.className = 'leader-org-tab px-3 py-1.5 rounded-lg text-xs font-semibold transition text-slate-600 hover:text-[#152548] hover:bg-slate-100 flex items-center gap-1.5 cursor-pointer';
          if (countSpan) countSpan.className = 'text-[10px] font-bold bg-slate-200 text-slate-700 px-1.5 py-0.2 rounded-full';
        }
      });

      renderLeadersTable();
    });
  });

  // v1.2.56 (Duane, 2026-11-21): two-tab interface (Authorized Users | Access Matrix) replaces the matrix show/hide toggle.
  const usersViewBtn = document.getElementById('tab-view-users');
  const matrixToggleBtn = document.getElementById('btn-toggle-access-matrix');
  if (usersViewBtn) usersViewBtn.addEventListener('click', () => setLeadersView('users'));
  if (matrixToggleBtn) matrixToggleBtn.addEventListener('click', () => setLeadersView('matrix'));
  const addCallingBtn = document.getElementById('btn-add-calling');
  if (addCallingBtn) addCallingBtn.addEventListener('click', () => openCallingModal(null));
  const areasInfoBtn = document.getElementById('btn-restricted-areas-info');
  if (areasInfoBtn) areasInfoBtn.addEventListener('click', (e) => { e.preventDefault(); openRestrictedAreasModal(); });
  const matrixBody = document.getElementById('access-matrix-table-body');
  if (matrixBody) {
    matrixBody.addEventListener('click', (e) => {
      const btn = e.target && e.target.closest ? e.target.closest('.btn-edit-calling') : null;
      if (btn) openCallingModal(btn.dataset.rc);
    });
  }
  const callingCopyBtn = document.getElementById('calling-copy-btn');
  if (callingCopyBtn) callingCopyBtn.addEventListener('click', copyCallingRow);
  const callingCsvBtn = document.getElementById('calling-csv-btn');
  if (callingCsvBtn) callingCsvBtn.addEventListener('click', downloadCallingsCsv);
  const callingSaveBtn = document.getElementById('calling-save-btn');
  if (callingSaveBtn) callingSaveBtn.addEventListener('click', () => saveCallingOnline());
}

function hideLeaderActionMenus() {
  document.querySelectorAll('.leader-action-menu').forEach(m => {
    m.classList.add('hidden');
    m.style.position = '';
    m.style.top = '';
    m.style.bottom = '';
    m.style.left = '';
    m.style.right = '';
  });
}

function renderLeadersTable() {
  const tbody = document.getElementById('leaders-table-body');
  if (!tbody) return;
  if (leadersTableDenied) { showLeadersLoadDenied(); return; }
  tbody.innerHTML = '';
  selectedLeaderIds.clear();
  updateLeadersBulkBar();

  // Update count badges on tabs
  const countAll = leadersCache.length;
  const countBishopric = leadersCache.filter(l => getLeaderOrg(l) === 'bishopric').length;
  const countYouth = leadersCache.filter(l => getLeaderOrg(l) === 'youth').length;
  const countEq = leadersCache.filter(l => getLeaderOrg(l) === 'elders_quorum').length;
  const countRs = leadersCache.filter(l => getLeaderOrg(l) === 'relief_society').length;
  const countSs = leadersCache.filter(l => getLeaderOrg(l) === 'sunday_school').length;

  const countAllEl = document.getElementById('count-leaders-all');
  if (countAllEl) countAllEl.textContent = countAll;
  const countBishEl = document.getElementById('count-leaders-bishopric');
  if (countBishEl) countBishEl.textContent = countBishopric;
  const countYouthEl = document.getElementById('count-leaders-youth');
  if (countYouthEl) countYouthEl.textContent = countYouth;
  const countEqEl = document.getElementById('count-leaders-eq');
  if (countEqEl) countEqEl.textContent = countEq;
  const countRsEl = document.getElementById('count-leaders-rs');
  if (countRsEl) countRsEl.textContent = countRs;
  const countSsEl = document.getElementById('count-leaders-ss');
  if (countSsEl) countSsEl.textContent = countSs;

  // Filter leaders by selected organization tab
  const orgTabMap = {
    bishopric: 'bishopric',
    youth: 'youth',
    eq: 'elders_quorum',
    rs: 'relief_society',
    ss: 'sunday_school'
  };
  let filteredLeaders = leadersCache;
  if (currentLeaderOrgTab !== 'all') {
    const targetOrg = orgTabMap[currentLeaderOrgTab] || currentLeaderOrgTab;
    filteredLeaders = leadersCache.filter(leader => getLeaderOrg(leader) === targetOrg);
  }

  if (filteredLeaders.length === 0) {
    const orgLabels = {
      all: 'leaders',
      bishopric: 'Bishopric leaders',
      youth: 'Youth leaders',
      eq: 'Elders Quorum leaders',
      rs: 'Relief Society leaders',
      ss: 'Sunday School leaders'
    };
    const label = orgLabels[currentLeaderOrgTab] || 'leaders';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td colspan="8" class="px-4 py-8 text-center text-slate-400">
        <p class="font-medium text-sm">No registered ${label} yet.</p>
        <p class="text-xs mt-1">Click "+ Add Ward Leader" above to register a cell phone number for passwordless login.</p>
      </td>
    `;
    tbody.appendChild(tr);
    return;
  }

  filteredLeaders.forEach(leader => {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-slate-50 transition';

    const calling = getLeaderCalling(leader);
    // v1.2.62: the Calling column shows the sheet Roles & Callings name(s), e.g. 'Web Administrator, Bishop'.
    const callingLabels = getLeaderCallingLabels(leader);
    const accessAreas = getLeaderAccessAreas(leader);

    let statusBadge = '';
    if (leader.onboarded) {
      statusBadge = '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-100 text-emerald-800"><span class="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>Onboarded</span>';
    } else if (leader.active !== false) {
      statusBadge = '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-50 text-blue-800 border border-blue-200">Active</span>';
    } else {
      statusBadge = '<span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-600">Inactive</span>';
    }

    let accessBadge = '';
    if (accessAreas.length === 7) {
      accessBadge = '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200" title="Settings &amp; Privacy, Combined, Priests, Teachers, Deacons, Young Women, Primary"><span class="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>Full Youth Access (7)</span>';
    } else if (accessAreas.length > 0) {
      accessBadge = `<span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-50 text-blue-800 border border-blue-200" title="${escapeHtml(accessAreas.join(', '))}">${escapeHtml(accessAreas.join(', '))}</span>`;
    } else {
      accessBadge = '<span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-500 border border-slate-200">Ward Portal Only</span>';
    }

    const canEdit = canUserEditLeader(leader);
    const canSetPw = canUserChangePassword(leader);
    const canOnboard = canUserOnboardLeader(leader);
    const canDelete = canUserDeleteLeader(leader);
    const hasAnyAction = canEdit || canSetPw || canOnboard || canDelete;
    const canSelectRow = canDelete || canOnboard;

    let actionCellHtml = '';
    if (hasAnyAction) {
      let menuItemsHtml = '';
      if (canEdit) {
        menuItemsHtml += `
          <button type="button" class="btn-action-edit w-full text-left px-3 py-1.5 text-xs font-medium text-[#152548] hover:bg-slate-50 flex items-center gap-2 transition cursor-pointer">
            <svg class="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
            <span>Edit</span>
          </button>
        `;
      }
      if (canSetPw) {
        menuItemsHtml += `
          <button type="button" class="btn-action-password w-full text-left px-3 py-1.5 text-xs font-medium text-[#152548] hover:bg-slate-50 flex items-center gap-2 transition cursor-pointer">
            <svg class="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"/></svg>
            <span>Set Password</span>
          </button>
        `;
      }
      if (canOnboard) {
        menuItemsHtml += `
          <button type="button" class="btn-action-onboard w-full text-left px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-50 flex items-center gap-2 transition cursor-pointer">
            <svg class="w-3.5 h-3.5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"/></svg>
            <span>Onboard</span>
          </button>
        `;
      }
      if (canDelete) {
        if (canEdit || canSetPw || canOnboard) {
          menuItemsHtml += `<div class="border-t border-[#E9DECE] my-0.5"></div>`;
        }
        menuItemsHtml += `
          <button type="button" class="btn-action-remove w-full text-left px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 flex items-center gap-2 transition cursor-pointer">
            <svg class="w-3.5 h-3.5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            <span>Remove</span>
          </button>
        `;
      }

      actionCellHtml = `
        <div class="relative inline-block text-left leader-action-dropdown-wrap">
          <button type="button" class="btn-leader-action px-2.5 py-1.5 bg-white border border-[#E9DECE] hover:border-[#152548] rounded-lg text-xs font-semibold text-[#152548] inline-flex items-center gap-1.5 shadow-2xs transition cursor-pointer">
            <span>Action</span>
            <svg class="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
          </button>
          <div class="leader-action-menu hidden absolute right-0 mt-1 w-36 bg-white border border-[#E9DECE] rounded-xl shadow-lg z-30 py-1 text-left">
            ${menuItemsHtml}
          </div>
        </div>
      `;
    } else {
      actionCellHtml = `
        <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium bg-slate-100 text-slate-500 border border-slate-200 select-none">
          <svg class="w-3 h-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
          <span>Protected</span>
        </span>
      `;
    }

    const checkCellHtml = canSelectRow
      ? `<input type="checkbox" class="leader-row-check rounded border-[#E9DECE] text-[#152548] focus:ring-0 cursor-pointer" data-id="${leader.id}">`
      : `<span class="inline-block w-3.5 h-3.5 text-slate-300 text-center select-none">—</span>`;

    tr.innerHTML = `
      <td class="w-10 px-3 py-3 text-center">
        ${checkCellHtml}
      </td>
      <td class="px-4 py-3 font-semibold text-[#152548]">${escapeHtml(leader.displayName || 'Leader')}</td>
      <td class="px-4 py-3 text-slate-600">${escapeHtml(leader.email || '—')}</td>
      <td class="px-4 py-3 font-mono text-slate-600">${escapeHtml(leader.phoneNumber || '')}</td>
      <td class="px-4 py-3">
        <span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-[#152548] border border-slate-200 cursor-help" title="${escapeHtml(callingLabels.title)}">
          ${escapeHtml(callingLabels.text)}
        </span>
      </td>
      <td class="w-px px-2 py-3 text-[11px] font-semibold text-slate-600 whitespace-nowrap">${renderOrgCodes(getLeaderOrgCodes(leader))}</td>
      <td class="px-4 py-3">${statusBadge}</td>
      <td class="px-4 py-3 text-right">
        ${actionCellHtml}
      </td>
    `;

    // Row Checkbox event
    const rowCheck = tr.querySelector('.leader-row-check');
    if (rowCheck) {
      rowCheck.addEventListener('change', (e) => {
        if (e.target.checked) {
          selectedLeaderIds.add(leader.id);
        } else {
          selectedLeaderIds.delete(leader.id);
        }
        updateLeadersBulkBar();
      });
    }

    // Row Action Dropdown Toggle & Events
    const actionBtn = tr.querySelector('.btn-leader-action');
    const actionMenu = tr.querySelector('.leader-action-menu');

    if (actionBtn && actionMenu) {
      actionBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isHidden = actionMenu.classList.contains('hidden');
        hideLeaderActionMenus();
        if (isHidden) {
          // v1.2.59: position fixed so the Authorized Users overflow container cannot
          // clip the menu; open upward when there is not enough space below the button.
          actionMenu.classList.remove('hidden');
          const btnRect = actionBtn.getBoundingClientRect();
          const menuH = actionMenu.offsetHeight || 160;
          const spaceBelow = window.innerHeight - btnRect.bottom;
          const openUp = spaceBelow < menuH + 8 && btnRect.top > spaceBelow;
          actionMenu.style.position = 'fixed';
          actionMenu.style.left = 'auto';
          actionMenu.style.right = `${Math.max(8, window.innerWidth - btnRect.right)}px`;
          if (openUp) {
            actionMenu.style.top = 'auto';
            actionMenu.style.bottom = `${Math.max(8, window.innerHeight - btnRect.top + 4)}px`;
          } else {
            actionMenu.style.top = `${btnRect.bottom + 4}px`;
            actionMenu.style.bottom = 'auto';
          }
        }
      });

      const editBtn = tr.querySelector('.btn-action-edit');
      if (editBtn) {
        editBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          actionMenu.classList.add('hidden');
          openLeaderModal(leader);
        });
      }

      const pwBtn = tr.querySelector('.btn-action-password');
      if (pwBtn) {
        pwBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          actionMenu.classList.add('hidden');
          openAdminSetPasswordModal(leader);
        });
      }

      const onboardBtn = tr.querySelector('.btn-action-onboard');
      if (onboardBtn) {
        onboardBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          actionMenu.classList.add('hidden');
          openOnboardModal(leader);
        });
      }

      const removeBtn = tr.querySelector('.btn-action-remove');
      if (removeBtn) {
        removeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          actionMenu.classList.add('hidden');
          deleteLeader(leader.id);
        });
      }
    }

    tbody.appendChild(tr);
  });
}

function openOnboardModal(leader) {
  const modal = document.getElementById('onboard-modal');
  if (!modal || !leader) return;

  if (!canUserOnboardLeader(leader)) {
    alert("Permission denied: You do not have permission to onboard this leader.");
    return;
  }

  const roleInfo = ROLE_DEFINITIONS[leader.role] || { label: leader.role || 'Ward Leader' };
  const formattedPhone = leader.phoneNumber || '';
  const name = leader.displayName || 'Ward Leader';
  const email = (leader.email || '').trim();
  const callingLabel = getLeaderCalling(leader) || roleInfo.label;
  const accessAreas = getLeaderAccessAreas(leader);

  document.getElementById('onboard-modal-title').textContent = `Onboard: ${name}`;
  document.getElementById('onboard-name-val').textContent = name;
  document.getElementById('onboard-role-badge').textContent = callingLabel;
  document.getElementById('onboard-phone-val').textContent = formattedPhone || '—';
  document.getElementById('onboard-email-val').textContent = email || '— (Add email in Edit)';

  const portalOrigin = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'https://test.blackstoneward.org'
    : window.location.origin;
  const portalUrl = `${portalOrigin}/admin/`;
  const youthAccessLine = accessAreas.length > 0
    ? `\nYouth Hub Admin Access (https://youth.blackstoneward.org): ${accessAreas.join(', ')}\n`
    : '';

  const inviteMsg = `Hello ${name},\n\nYou have been registered with leadership access to the Blackstone Ward Administration Portal as ${callingLabel}.${youthAccessLine}\nTo sign in:\n1. Visit: ${portalUrl}\n2. Type your first and last name (${name}) and enter your mobile phone: ${formattedPhone}\n3. Click "Send Text Code" and enter your 6-digit verification code.\n\nWelcome to the leadership portal!`;

  const msgTextarea = document.getElementById('onboard-message-text');
  if (msgTextarea) msgTextarea.value = inviteMsg;

  const smsLink = document.getElementById('onboard-sms-link');
  const smsLabel = document.getElementById('onboard-sms-label');
  const emailLink = document.getElementById('onboard-email-link');
  const emailLabel = document.getElementById('onboard-email-label');
  const markBtn = document.getElementById('onboard-mark-btn');
  const markText = document.getElementById('onboard-mark-text');

  if (smsLabel) smsLabel.textContent = 'Send Text (SMS)';
  if (emailLabel) emailLabel.textContent = email ? 'Send Email' : 'Send Email (Add Recipient)';

  function syncOnboardLinks() {
    const currentMsg = msgTextarea ? msgTextarea.value : inviteMsg;
    if (smsLink) {
      const rawDigits = formattedPhone.replace(/[^\d+]/g, '');
      smsLink.href = `sms:${rawDigits}?&body=${encodeURIComponent(currentMsg)}`;
    }
    if (emailLink) {
      const subject = `Blackstone Ward Leadership Portal Access — ${callingLabel}`;
      const mailBody = currentMsg.replace(/\r?\n/g, '\r\n');
      emailLink.href = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(mailBody)}`;
    }
  }

  syncOnboardLinks();
  if (msgTextarea) {
    msgTextarea.oninput = syncOnboardLinks;
  }

  function completeLeaderOnboarding() {
    leader.onboarded = true;
    leader.onboardedAt = new Date().toISOString();
    const idx = leadersCache.findIndex(l => l.id === leader.id);
    if (idx >= 0) leadersCache[idx] = leader;
    try { localStorage.setItem('local_ward_leaders', JSON.stringify(leadersCache)); } catch (_) { }
    renderLeadersTable();
    if (markText) markText.textContent = "✓ Marked Onboarded!";
    setDoc(doc(db, "ward_leaders", leader.id), { onboarded: true, onboardedAt: leader.onboardedAt }, { merge: true }).catch((e) => { if (isPermissionDenied(e)) alertLeadersDenied(LEADERS_EDIT_DENIED_MSG); });
  }

  if (smsLink) {
    smsLink.onclick = () => {
      syncOnboardLinks();
      completeLeaderOnboarding();
      if (smsLabel) smsLabel.textContent = "✓ Text Opened & Onboarded";
    };
  }

  if (emailLink) {
    emailLink.onclick = () => {
      syncOnboardLinks();
      completeLeaderOnboarding();
      if (emailLabel) emailLabel.textContent = "✓ Email Opened & Onboarded";
    };
  }

  const copyBtn = document.getElementById('onboard-copy-btn');
  const copyText = document.getElementById('onboard-copy-text');
  if (copyBtn) {
    copyBtn.onclick = async () => {
      const currentMsg = msgTextarea ? msgTextarea.value : inviteMsg;
      try {
        await navigator.clipboard.writeText(currentMsg);
        if (copyText) copyText.textContent = "✓ Copied!";
        setTimeout(() => { if (copyText) copyText.textContent = "Copy Invitation"; }, 2000);
      } catch (_) {
        alert("Invitation text copied to clipboard!");
      }
    };
  }

  if (markBtn) {
    if (leader.onboarded) {
      if (markText) markText.textContent = "✓ Already Onboarded (Click to Re-confirm)";
    } else {
      if (markText) markText.textContent = "Mark Leader as Onboarded";
    }
    markBtn.onclick = async () => {
      completeLeaderOnboarding();
      setTimeout(() => closeModals(), 800);
    };
  }

  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function openBulkOnboardModal(leadersList) {
  if (!Array.isArray(leadersList) || leadersList.length === 0) return;
  if (leadersList.length === 1) {
    openOnboardModal(leadersList[0]);
    return;
  }

  const modal = document.getElementById('onboard-modal');
  if (!modal) return;

  const names = leadersList.map(l => l.displayName || 'Leader').join(', ');
  const callings = Array.from(new Set(leadersList.map(l => getLeaderCalling(l)))).join(', ');
  const phones = leadersList.map(l => (l.phoneNumber || '').trim()).filter(Boolean);
  const emails = leadersList.map(l => (l.email || '').trim()).filter(Boolean);

  document.getElementById('onboard-modal-title').textContent = `Bulk Onboard (${leadersList.length} Leaders)`;
  document.getElementById('onboard-name-val').textContent = names;
  document.getElementById('onboard-role-badge').textContent = callings;
  document.getElementById('onboard-phone-val').textContent = `${phones.length} phone number(s)`;
  document.getElementById('onboard-email-val').textContent = emails.length > 0 ? `${emails.length} email(s): ${emails.join(', ')}` : '—';

  const portalOrigin = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'https://test.blackstoneward.org'
    : window.location.origin;
  const portalUrl = `${portalOrigin}/admin/`;

  const inviteMsg = `Hello Blackstone Ward Leaders,\n\nYou have been registered with leadership access to the Blackstone Ward Administration Portal and Youth Hub.\n\nTo sign in:\n1. Visit: ${portalUrl}\n2. Type your first and last name and enter your mobile phone number\n3. Click "Send Text Code" and enter your 6-digit verification code.\n\nWelcome to the leadership portal!`;

  const msgTextarea = document.getElementById('onboard-message-text');
  if (msgTextarea) msgTextarea.value = inviteMsg;

  const smsLink = document.getElementById('onboard-sms-link');
  const smsLabel = document.getElementById('onboard-sms-label');
  const emailLink = document.getElementById('onboard-email-link');
  const emailLabel = document.getElementById('onboard-email-label');
  const markBtn = document.getElementById('onboard-mark-btn');
  const markText = document.getElementById('onboard-mark-text');

  if (smsLabel) smsLabel.textContent = `Send Text (${phones.length})`;
  if (emailLabel) emailLabel.textContent = emails.length > 0 ? `Send Email (${emails.length})` : 'Send Email';
  if (markText) markText.textContent = `Mark ${leadersList.length} Leaders as Onboarded`;

  function syncBulkLinks() {
    const currentMsg = msgTextarea ? msgTextarea.value : inviteMsg;
    if (smsLink) {
      const rawPhoneList = phones.map(p => p.replace(/[^\d+]/g, '')).filter(Boolean).join(',');
      smsLink.href = `sms:${rawPhoneList}?&body=${encodeURIComponent(currentMsg)}`;
    }
    if (emailLink) {
      const subject = `Blackstone Ward Leadership Portal Access`;
      const mailBody = currentMsg.replace(/\r?\n/g, '\r\n');
      const bccParam = emails.length > 0 ? `bcc=${encodeURIComponent(emails.join(','))}&` : '';
      emailLink.href = `mailto:?${bccParam}subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(mailBody)}`;
    }
  }

  syncBulkLinks();
  if (msgTextarea) {
    msgTextarea.oninput = syncBulkLinks;
  }

  function completeBulkOnboarding() {
    const now = new Date().toISOString();
    leadersList.forEach(l => {
      l.onboarded = true;
      l.onboardedAt = now;
      setDoc(doc(db, "ward_leaders", l.id), { onboarded: true, onboardedAt: now }, { merge: true }).catch((e) => { if (isPermissionDenied(e)) alertLeadersDenied(LEADERS_EDIT_DENIED_MSG); });
    });
    try { localStorage.setItem('local_ward_leaders', JSON.stringify(leadersCache)); } catch (_) { }
    renderLeadersTable();
    if (markText) markText.textContent = `✓ Marked ${leadersList.length} Onboarded!`;
  }

  if (smsLink) {
    smsLink.onclick = () => {
      syncBulkLinks();
      completeBulkOnboarding();
      if (smsLabel) smsLabel.textContent = "✓ Text Opened & Onboarded";
    };
  }

  if (emailLink) {
    emailLink.onclick = () => {
      syncBulkLinks();
      completeBulkOnboarding();
      if (emailLabel) emailLabel.textContent = "✓ Email Opened & Onboarded";
    };
  }

  const copyBtn = document.getElementById('onboard-copy-btn');
  const copyText = document.getElementById('onboard-copy-text');
  if (copyBtn) {
    copyBtn.onclick = async () => {
      const currentMsg = msgTextarea ? msgTextarea.value : inviteMsg;
      try {
        await navigator.clipboard.writeText(currentMsg);
        if (copyText) copyText.textContent = "✓ Copied!";
        setTimeout(() => { if (copyText) copyText.textContent = "Copy Invitation"; }, 2000);
      } catch (_) {
        alert("Invitation text copied to clipboard!");
      }
    };
  }

  if (markBtn) {
    markBtn.onclick = () => {
      completeBulkOnboarding();
      setTimeout(() => closeModals(), 800);
    };
  }

  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function openLeaderModal(leader = null) {
  if (leader && !canUserEditLeader(leader)) {
    alert("Permission denied: You do not have permission to edit this leader.");
    return;
  }
  if (!leader && !canUserAddLeader()) {
    alert("Permission denied: You do not have permission to add new leaders.");
    return;
  }

  const modal = document.getElementById('leader-modal');
  const title = document.getElementById('leader-modal-title');
  const delBtn = document.getElementById('leader-delete-btn');
  document.getElementById('leader-id').value = leader?.id || '';
  document.getElementById('leader-name').value = leader?.displayName || '';
  document.getElementById('leader-email').value = leader?.email || '';
  document.getElementById('leader-phone').value = leader?.phoneNumber || '';

  const callingSelect = document.getElementById('leader-calling');
  // v1.2.55: new leaders start with no calling picked (no 'Bishopric' default).
  const callingVal = leader ? getLeaderCalling(leader) : '';
  if (callingSelect) {
    // v1.2.66: render org-grouped v6 options; select the first matching option.
    // A stored calling that is not a v6 name gets a disabled retired placeholder.
    renderCallingOptions(callingVal);
  }
  const roleHidden = document.getElementById('leader-role');
  if (roleHidden) {
    roleHidden.value = leader ? resolveLeaderRole(leader) : (getCallingDef(callingVal)?.role || getCallingDef(callingVal)?.org || '');
  }

  document.getElementById('leader-active').checked = leader ? leader.active !== false : true;

  const pwInput = document.getElementById('leader-password');
  const pwStatus = document.getElementById('leader-password-status');
  if (pwInput) pwInput.value = '';
  if (pwStatus) {
    if (leader && (leader.hasPassword || leader.passwordHash)) { // v1.2.91: hasPassword is set by the server
      pwStatus.textContent = '✓ Password set';
      pwStatus.className = 'text-[10px] text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200';
    } else {
      pwStatus.textContent = 'No password set';
      pwStatus.className = 'text-[10px] text-slate-500 font-medium';
    }
  }

  if (leader) {
    title.textContent = 'Edit Ward Leader';
    if (canUserDeleteLeader(leader)) {
      delBtn.classList.remove('hidden');
      delBtn.onclick = () => deleteLeader(leader.id);
    } else {
      delBtn.classList.add('hidden');
    }
  } else {
    title.textContent = 'Add Ward Leader';
    delBtn.classList.add('hidden');
  }

  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

async function saveLeader() {
  const idInput = document.getElementById('leader-id').value;
  const name = document.getElementById('leader-name').value.trim();
  const email = (document.getElementById('leader-email')?.value || '').trim();
  const rawPhone = document.getElementById('leader-phone').value.trim();
  const selectedCalling = document.getElementById('leader-calling')?.value || '';
  const originalCalling = document.getElementById('leader-calling')?.dataset.originalCalling || '';
  const active = document.getElementById('leader-active').checked;
  const newPw = (document.getElementById('leader-password')?.value || '').trim();

  const existing = idInput ? leadersCache.find(l => l.id === idInput) : null;
  // v1.2.66: if an existing record still holds a retired (non-v6) calling and the
  // editor has not picked a v6 calling, keep calling, accessAreas, role and org as stored.
  let calling = selectedCalling;
  let preserveRetired = false;
  if (existing && !isV6Calling(callingCatalog, selectedCalling)) {
    const stored = existing.calling || getLeaderCalling(existing);
    if (stored && !isV6Calling(callingCatalog, stored) && (selectedCalling === '' || selectedCalling === stored || selectedCalling === originalCalling)) {
      calling = stored;
      preserveRetired = true;
    }
  }
  const def = getCallingDef(calling);
  const org = preserveRetired ? (existing.org || getLeaderOrg(existing) || 'bishopric') : (def ? def.org : 'bishopric');
  // v1.2.59: Youth Hub access checkboxes removed. Keep a saved accessAreas list on
  // edit when the calling is unchanged so custom values are not wiped; otherwise
  // derive from the calling / master-sheet defaults.
  let accessAreas;
  if (preserveRetired) {
    accessAreas = Array.isArray(existing.accessAreas) ? existing.accessAreas : [];
  } else if (existing && Array.isArray(existing.accessAreas) && existing.calling === calling) {
    accessAreas = existing.accessAreas;
  } else {
    const seatRc = Object.keys(HOME_ADMIN_SEATS).find(rc => HOME_ADMIN_SEATS[rc] === calling) || HOME_ADMIN_LEGACY_CALLINGS[calling];
    accessAreas = seatRc ? youthAreaNamesFromIds(getRcAreaUnion([seatRc])) : (def ? [...def.defaultAccess] : []);
  }
  // v1.2.55: a calling is required; new leaders can't use the legacy 'Bishopric' (pick the specific seat).
  if (!calling) {
    alert("Please pick a calling. Bishopric members pick their specific seat (for example Bishopric 1st Counselor).");
    return;
  }
  if (calling === 'Bishopric' && !existing) {
    alert("Please pick the specific bishopric seat (for example Bishopric 1st Counselor) instead of the legacy 'Bishopric'.");
    return;
  }

  if (idInput) {
    if (existing && !canUserEditLeader(existing)) {
      alert("Permission denied: You do not have permission to edit this leader.");
      return;
    }
  } else {
    if (!canUserAddLeader()) {
      alert("Permission denied: You do not have permission to add new leaders.");
      return;
    }
  }

  if (!name) {
    alert("Please provide the leader's name.");
    return;
  }

  // v1.2.60: phone is optional. If one is entered, it must still be a valid 10-digit number.
  let phone = '';
  if (rawPhone) {
    phone = normalizePhone(rawPhone);
    if (phone.length < 11) {
      alert("Please enter a valid 10-digit mobile phone number.");
      return;
    }
  }

  // v1.2.60 (Duane): at least one sign-in method is required — a valid phone, a personal
  // password (set now or already saved), or an email for Google sign-in.
  const hasPassword = !!newPw || !!(existing && (existing.hasPassword || existing.passwordHash)); // v1.2.91
  if (!phone && !hasPassword && !email) {
    alert("Please provide at least one sign-in method: a mobile phone, a personal password, or an email for Google sign-in.");
    return;
  }

  const id = idInput || `leader_${Date.now()}`;

  // v1.2.60: reject a duplicate phone or email against other active leaders.
  if (phone && phone.length >= 11) {
    const dupPhone = leadersCache.find(l => l && l.active !== false && l.id !== id && normalizePhone(l.phoneNumber || '') === phone);
    if (dupPhone) {
      alert(`Another active leader (${dupPhone.displayName || 'a leader'}) already uses this phone number. Each leader needs a unique phone.`);
      return;
    }
  }
  if (email) {
    const wantEmail = email.toLowerCase();
    const dupEmail = leadersCache.find(l => l && l.active !== false && l.id !== id && String(l.email || '').trim().toLowerCase() === wantEmail);
    if (dupEmail) {
      alert(`Another active leader (${dupEmail.displayName || 'a leader'}) already uses this email. Each leader needs a unique email for Google sign-in.`);
      return;
    }
  }

  const role = preserveRetired
    ? (existing.role || resolveLeaderRole({
      id,
      phoneNumber: phone,
      calling,
      org,
      accessAreas,
      role: existing?.role,
      rcCodes: Array.isArray(existing?.rcCodes) ? existing.rcCodes : undefined
    }))
    : resolveLeaderRole({
    id,
    phoneNumber: phone,
    calling,
    org,
    accessAreas,
    role: existing?.role,
    rcCodes: calling === 'Bishopric' && Array.isArray(existing?.rcCodes) ? existing.rcCodes : undefined // v1.2.57: area-based role
  });
  // v1.2.55: rcCodes come from the picked seat (single source HOME_ADMIN_SEATS). Legacy 'Bishopric' keeps what the
  // record already had. v1.2.60: owner seats (RC2 + RC1) are forced only on the owner document itself, not on
  // any other record that happens to share the owner phone.
  // v1.2.66: a v6 calling that is not one of the Home gate seats still gets its RC code from the catalog.
  let rcCodes;
  if (preserveRetired) {
    rcCodes = Array.isArray(existing?.rcCodes) ? existing.rcCodes : [];
  } else if (calling === 'Bishopric') {
    rcCodes = Array.isArray(existing?.rcCodes) ? existing.rcCodes : [];
  } else {
    const seatCodes = Object.keys(HOME_ADMIN_SEATS).filter(rc => HOME_ADMIN_SEATS[rc] === calling);
    const catalogRc = v6RcForCalling(callingCatalog, calling);
    rcCodes = seatCodes.length ? seatCodes : (catalogRc ? [catalogRc] : []);
  }
  if (id === HOME_ADMIN_OWNER.id) {
    rcCodes = [...new Set([...HOME_ADMIN_OWNER.seats, ...rcCodes])];
  }
  const payload = {
    displayName: name,
    email: email,
    phoneNumber: phone,
    calling: calling,
    role: role,
    org: org,
    accessAreas: accessAreas,
    rcCodes: rcCodes,
    active: active,
    updatedAt: new Date().toISOString()
  };
  // v1.2.57: a Home-only seat (home_admin) can't give access it doesn't hold (e.g. pick Bishop or add Youth areas).
  if (resolveLeaderRole(currentLeaderProfile) === 'home_admin' && !canGrantWithin({ id, ...payload })) {
    alert("You can only give access you hold yourself. Please ask the Bishop to set this calling or these areas.");
    return;
  }

  const existingIdx = leadersCache.findIndex(l => l.id === id);
  if (newPw) {
    if (idInput && existingIdx >= 0) {
      if (!canUserChangePassword(leadersCache[existingIdx])) {
        alert("Permission denied: You do not have permission to set a password for this user.");
        return;
      }
    }
    // v1.2.91 (#2): the new password goes only to the server (after the record is saved below); no hash is made here,
    // and the stored hash is no longer copied back into ward_leaders.
  }

  // Immediate local update so the UI updates with zero lag
  if (existingIdx >= 0) {
    leadersCache[existingIdx] = { id, ...leadersCache[existingIdx], ...payload };
  } else {
    leadersCache.unshift({ id, ...payload });
  }
  try { localStorage.setItem('local_ward_leaders', JSON.stringify(leadersCache)); } catch (_) { }
  renderLeadersTable();
  closeModals();

  // Cloud Firestore persistence
  try {
    await setDoc(doc(db, "ward_leaders", id), payload, { merge: true });
  } catch (err) {
    console.warn("Save leader cloud warning:", err);
    if (isPermissionDenied(err)) alertLeadersDenied(LEADERS_EDIT_DENIED_MSG);
    return;
  }
  if (newPw) await saveLeaderPasswordOnServer(id, newPw, payload.displayName); // v1.2.91 (#2)
}

// v1.2.91 (Duane 2026-11-23, #2): personal passwords are set only through the server (passkeyApi /password/set), which
// stores a salted scrypt hash where no browser can read it and marks the leader record hasPassword. It needs this tab's
// Firebase sign-in: an admin/bishopric passkey sign-in for anyone, or the leader's own passkey / text / Google sign-in.
async function saveLeaderPasswordOnServer(leaderId, password, displayName) {
  const who = displayName || 'this leader';
  try {
    const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : '';
    if (!idToken) {
      alert(`The password for ${who} was not saved. Sign in with your passkey first, then set it again.`);
      return false;
    }
    await setLeaderPassword({ leaderId, password }, idToken);
    const idx = leadersCache.findIndex(l => l.id === leaderId);
    if (idx >= 0) {
      const { passwordHash: _droppedHash, ...rest } = leadersCache[idx];
      leadersCache[idx] = { ...rest, hasPassword: true };
      try { localStorage.setItem('local_ward_leaders', JSON.stringify(leadersCache)); } catch (_) { }
      renderLeadersTable();
    }
    return true;
  } catch (e) {
    console.warn("Set password server warning:", (e && e.status) || 'error');
    alert(`The password for ${who} was not saved: ${(e && e.message) || 'please try again.'}`);
    return false;
  }
}

function openAdminSetPasswordModal(leader) {
  const modal = document.getElementById('admin-set-pw-modal');
  if (!modal || !leader) return;

  if (!canUserChangePassword(leader)) {
    alert("Permission denied: You do not have permission to change this user's password.");
    return;
  }

  const roleInfo = ROLE_DEFINITIONS[leader.role] || { label: leader.role || 'Leader' };
  document.getElementById('admin-set-pw-name').textContent = leader.displayName || 'Leader';
  document.getElementById('admin-set-pw-role').textContent = leader.calling || roleInfo.label;
  document.getElementById('admin-set-pw-leader-id').value = leader.id;
  const pwInput = document.getElementById('admin-set-pw-input');
  if (pwInput) pwInput.value = '';

  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

async function saveAdminSetPassword() {
  const leaderId = document.getElementById('admin-set-pw-leader-id').value;
  const pwInput = document.getElementById('admin-set-pw-input');
  const password = (pwInput?.value || '').trim();

  if (!leaderId) return;

  const leader = leadersCache.find(l => l.id === leaderId);
  if (!leader) {
    alert("Leader not found.");
    return;
  }

  if (!canUserChangePassword(leader)) {
    alert("Permission denied: You do not have permission to change this user's password.");
    return;
  }

  if (!password || password.length < 6) {
    alert("Please enter a password with at least 6 characters.");
    pwInput?.focus();
    return;
  }

  // v1.2.91 (#2): sent only to the server; nothing is hashed or stored in the browser.
  closeModals();
  if (await saveLeaderPasswordOnServer(leaderId, password, leader.displayName)) {
    alert(`Personal password for ${leader.displayName} has been saved!`);
  }
}

async function deleteLeader(id) {
  const leader = leadersCache.find(l => l.id === id);
  if (!leader) return;

  if (!canUserDeleteLeader(leader)) {
    alert("Permission denied: You do not have permission to remove this leader.");
    return;
  }

  if (!confirm(`Are you sure you want to remove access for ${leader.displayName || 'this leader'}?`)) return;
  leadersCache = leadersCache.filter(l => l.id !== id);
  selectedLeaderIds.delete(id);
  try { localStorage.setItem('local_ward_leaders', JSON.stringify(leadersCache)); } catch (_) { }
  renderLeadersTable();
  closeModals();
  deleteDoc(doc(db, "ward_leaders", id)).catch(err => {
    console.warn("Delete leader cloud sync:", err);
    if (isPermissionDenied(err)) alertLeadersDenied(LEADERS_REMOVE_DENIED_MSG);
  });
}

// ================= MODAL CONTROLS =================
function closeModals() {
  document.querySelectorAll('#youth-import-modal, #event-modal, #announcement-modal, #spotlight-modal, #day-modal, #leader-modal, #onboard-modal, #admin-set-pw-modal, #reset-password-modal, #calling-modal, #restricted-areas-modal, #leaders-denied-modal').forEach(m => {
    m.classList.add('hidden');
    m.classList.remove('flex');
  });
}

function setupModalTriggers() {
  document.getElementById('btn-add-event').addEventListener('click', () => openEventModal());
  document.getElementById('btn-add-announcement').addEventListener('click', () => openAnnouncementModal());
  document.getElementById('btn-add-spotlight').addEventListener('click', () => openSpotlightModal());
  const btnAddLeader = document.getElementById('btn-add-leader');
  if (btnAddLeader) btnAddLeader.addEventListener('click', () => openLeaderModal());

  const btnImportYouth = document.getElementById('btn-import-youth');
  if (btnImportYouth) btnImportYouth.addEventListener('click', openYouthImportModal);

  const youthImportCloseBtn = document.getElementById('youth-import-close-btn');
  if (youthImportCloseBtn) youthImportCloseBtn.addEventListener('click', closeModals);

  const youthImportCancelBtn = document.getElementById('youth-import-cancel-btn');
  if (youthImportCancelBtn) youthImportCancelBtn.addEventListener('click', closeModals);

  const youthImportSelectAll = document.getElementById('youth-import-select-all');
  if (youthImportSelectAll) {
    youthImportSelectAll.addEventListener('change', () => {
      const isChecked = youthImportSelectAll.checked;
      const checkboxes = document.querySelectorAll('.youth-import-checkbox:not(:disabled)');
      checkboxes.forEach(cb => {
        cb.checked = isChecked;
        if (isChecked) selectedYouthImportIds.add(cb.value);
        else selectedYouthImportIds.delete(cb.value);
      });
      updateYouthImportSubmitState();
    });
  }

  const youthImportSubmitBtn = document.getElementById('youth-import-submit-btn');
  if (youthImportSubmitBtn) youthImportSubmitBtn.addEventListener('click', importSelectedYouthEvents);

  document.getElementById('event-save-btn').addEventListener('click', saveEvent);
  document.getElementById('ann-save-btn').addEventListener('click', saveAnnouncement);
  document.getElementById('spot-save-btn').addEventListener('click', saveSpotlight);
  const leaderSaveBtn = document.getElementById('leader-save-btn');
  if (leaderSaveBtn) {
    leaderSaveBtn.addEventListener('click', (e) => {
      e.preventDefault();
      saveLeader();
    });
  }
  const leaderForm = document.getElementById('leader-form');
  if (leaderForm) {
    leaderForm.addEventListener('submit', (e) => {
      e.preventDefault();
      saveLeader();
    });
  }

  document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', closeModals);
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModals();
  });

  initLeaderOrgTabs();
  renderAccessMatrixTable();
}

// ================= INITIALIZE =================
document.addEventListener('DOMContentLoaded', () => {
  setupNavigation();
  setupModalTriggers();
  renderCallingOptions('');
  loadCallingCatalog();

  // Phone Login Events
  const phoneForm = document.getElementById('phone-login-form');
  if (phoneForm) phoneForm.addEventListener('submit', handleSendPhoneCode);

  const phoneVerifyBtn = document.getElementById('phone-verify-btn');
  if (phoneVerifyBtn) phoneVerifyBtn.addEventListener('click', handleVerifyPhoneCode);

  const phoneResendBtn = document.getElementById('phone-resend-btn');
  if (phoneResendBtn) phoneResendBtn.addEventListener('click', handleSendPhoneCode);

  const phoneChangeBtn = document.getElementById('phone-change-btn');
  if (phoneChangeBtn) {
    phoneChangeBtn.addEventListener('click', () => {
      document.getElementById('phone-step-2').classList.add('hidden');
      document.getElementById('phone-step-1').classList.remove('hidden');
      const phoneInput = document.getElementById('admin-phone');
      if (phoneInput) phoneInput.focus();
    });
  }

  // 1-Click Clipboard Paste button for Mac / iPhone users
  const pasteSmsBtn = document.getElementById('btn-paste-sms');
  const smsCodeInput = document.getElementById('admin-sms-code');

  if (pasteSmsBtn && smsCodeInput) {
    pasteSmsBtn.addEventListener('click', async () => {
      try {
        const text = (await navigator.clipboard.readText()).trim();
        const match = text.match(/\b\d{6}\b/) || text.replace(/\D/g, '').slice(0, 6);
        const code = Array.isArray(match) ? match[0] : match;
        if (code && code.length === 6) {
          smsCodeInput.value = code;
          handleVerifyPhoneCode();
        } else if (text) {
          const digits = text.replace(/\D/g, '').slice(0, 6);
          smsCodeInput.value = digits;
          if (digits.length === 6) handleVerifyPhoneCode();
        }
      } catch (err) {
        console.warn("Clipboard access error:", err);
        smsCodeInput.focus();
      }
    });
  }

  // Auto-verify when 6 digits are typed or pasted
  if (smsCodeInput) {
    smsCodeInput.addEventListener('input', () => {
      const digits = smsCodeInput.value.replace(/\D/g, '').slice(0, 6);
      smsCodeInput.value = digits;
      if (digits.length === 6) {
        handleVerifyPhoneCode();
      }
    });
    smsCodeInput.addEventListener('paste', (e) => {
      const pasted = (e.clipboardData || window.clipboardData)?.getData('text') || '';
      const match = pasted.match(/\b\d{6}\b/) || pasted.replace(/\D/g, '').slice(0, 6);
      const digits = Array.isArray(match) ? match[0] : match;
      if (digits && digits.length === 6) {
        e.preventDefault();
        smsCodeInput.value = digits;
        handleVerifyPhoneCode();
      }
    });
  }

  // Passkey Events
  initBiometricUI();
  const passkeyBtn = document.getElementById('passkey-login-btn');
  if (passkeyBtn) passkeyBtn.addEventListener('click', handlePasskeyLogin);
  const googleBtn = document.getElementById('btn-google-signin');
  if (googleBtn) googleBtn.addEventListener('click', handleGoogleSignIn);

  const enrollPasskeyBtn = document.getElementById('btn-enroll-passkey');
  if (enrollPasskeyBtn) enrollPasskeyBtn.addEventListener('click', handleEnrollPasskey);
  const enrollBannerBtn = document.getElementById('btn-enroll-passkey-banner');
  if (enrollBannerBtn) enrollBannerBtn.addEventListener('click', handleEnrollPasskey);
  const dismissBannerBtn = document.getElementById('btn-dismiss-passkey-banner');
  if (dismissBannerBtn) {
    dismissBannerBtn.addEventListener('click', () => {
      localStorage.setItem('wardPasskeyBannerDismissed', 'true');
      const banner = document.getElementById('passkey-enroll-banner');
      if (banner) banner.classList.add('hidden');
    });
  }

  // TouchID / Passkey First-Login Onboarding Prompt Listeners
  const btnPromptEnable = document.getElementById('btn-prompt-enable-passkey');
  if (btnPromptEnable) {
    btnPromptEnable.addEventListener('click', async () => {
      await handleEnrollPasskey();
    });
  }

  const btnPromptDismiss = document.getElementById('btn-prompt-dismiss-passkey');
  if (btnPromptDismiss) {
    btnPromptDismiss.addEventListener('click', () => {
      const modal = document.getElementById('passkey-prompt-modal');
      if (modal) modal.classList.add('hidden');
      localStorage.setItem('wardPasskeyPromptDismissed', 'true');
    });
  }

  // Toggle View between Phone Login and Password Login
  const togglePasscodeBtn = document.getElementById('toggle-passcode-view-btn');
  const togglePhoneBtn = document.getElementById('toggle-phone-view-btn');
  const passcodeForm = document.getElementById('login-form');

  if (togglePasscodeBtn && togglePhoneBtn && phoneForm && passcodeForm) {
    togglePasscodeBtn.addEventListener('click', () => {
      phoneForm.classList.add('hidden');
      togglePasscodeBtn.parentElement.classList.add('hidden');
      passcodeForm.classList.remove('hidden');

      // Sync leader name if entered on phone form
      const phoneName = document.getElementById('admin-name-lookup')?.value || '';
      const pwName = document.getElementById('password-leader-lookup');
      if (pwName && phoneName && !pwName.value) pwName.value = phoneName;

      const input = document.getElementById('admin-passcode');
      if (input) input.focus();
    });

    togglePhoneBtn.addEventListener('click', () => {
      passcodeForm.classList.add('hidden');
      phoneForm.classList.remove('hidden');
      togglePasscodeBtn.parentElement.classList.remove('hidden');

      // Sync leader name if entered on password form
      const pwName = document.getElementById('password-leader-lookup')?.value || '';
      const phoneName = document.getElementById('admin-name-lookup');
      if (phoneName && pwName && !phoneName.value) phoneName.value = pwName;

      const input = document.getElementById('admin-phone');
      if (input) input.focus();
    });
  }

  // Sync leader name inputs when typed
  const adminNameInput = document.getElementById('admin-name-lookup');
  const pwLeaderInput = document.getElementById('password-leader-lookup');
  if (adminNameInput && pwLeaderInput) {
    adminNameInput.addEventListener('input', () => {
      if (!pwLeaderInput.value || pwLeaderInput.dataset.synced === 'true') {
        pwLeaderInput.value = adminNameInput.value;
        pwLeaderInput.dataset.synced = 'true';
      }
    });
    pwLeaderInput.addEventListener('input', () => {
      pwLeaderInput.dataset.synced = 'false';
    });
  }

  // Password Visibility Toggles
  const btnToggleLoginPw = document.getElementById('btn-toggle-login-pw');
  if (btnToggleLoginPw) {
    btnToggleLoginPw.addEventListener('click', () => {
      const input = document.getElementById('admin-passcode');
      const eyeOpen = document.getElementById('login-pw-eye-open');
      const eyeClosed = document.getElementById('login-pw-eye-closed');
      if (!input) return;
      if (input.type === 'password') {
        input.type = 'text';
        eyeOpen?.classList.add('hidden');
        eyeClosed?.classList.remove('hidden');
      } else {
        input.type = 'password';
        eyeOpen?.classList.remove('hidden');
        eyeClosed?.classList.add('hidden');
      }
    });
  }

  const btnToggleModalPw = document.getElementById('btn-toggle-modal-pw');
  if (btnToggleModalPw) {
    btnToggleModalPw.addEventListener('click', () => {
      const input = document.getElementById('leader-password');
      if (input) input.type = input.type === 'password' ? 'text' : 'password';
    });
  }

  // Admin Set Password Modal Controls
  const btnAdminGeneratePw = document.getElementById('btn-admin-generate-pw');
  if (btnAdminGeneratePw) {
    btnAdminGeneratePw.addEventListener('click', () => {
      const randomNum = Math.floor(100 + Math.random() * 900);
      const generated = `Blackstone${randomNum}!`;
      const input = document.getElementById('admin-set-pw-input');
      if (input) {
        input.value = generated;
        input.select();
      }
    });
  }

  const btnAdminCopyPw = document.getElementById('btn-admin-copy-pw');
  const adminCopyPwText = document.getElementById('admin-copy-pw-text');
  if (btnAdminCopyPw) {
    btnAdminCopyPw.addEventListener('click', async () => {
      const val = document.getElementById('admin-set-pw-input')?.value || '';
      if (!val) return;
      try {
        await navigator.clipboard.writeText(val);
        if (adminCopyPwText) adminCopyPwText.textContent = "✓ Copied";
        setTimeout(() => { if (adminCopyPwText) adminCopyPwText.textContent = "Copy"; }, 2000);
      } catch (_) {
        alert(`Password: ${val}`);
      }
    });
  }

  const adminSetPwSaveBtn = document.getElementById('admin-set-pw-save-btn');
  if (adminSetPwSaveBtn) {
    adminSetPwSaveBtn.addEventListener('click', saveAdminSetPassword);
  }

  // Self-Service Reset Password Modal Controls
  const btnOpenSelfReset = document.getElementById('btn-open-self-reset');
  if (btnOpenSelfReset) btnOpenSelfReset.addEventListener('click', openSelfResetModal);

  const btnResetSendCode = document.getElementById('btn-reset-send-code');
  if (btnResetSendCode) btnResetSendCode.addEventListener('click', handleSelfResetSendCode);

  const btnResetPasteCode = document.getElementById('btn-reset-paste-code');
  if (btnResetPasteCode) {
    btnResetPasteCode.addEventListener('click', async () => {
      try {
        const text = (await navigator.clipboard.readText()).trim();
        const match = text.match(/\b\d{6}\b/) || text.replace(/\D/g, '').slice(0, 6);
        const code = Array.isArray(match) ? match[0] : match;
        const input = document.getElementById('reset-code-input');
        if (input && code) input.value = code;
      } catch (_) { }
    });
  }

  const btnResetSubmit = document.getElementById('btn-reset-submit');
  if (btnResetSubmit) btnResetSubmit.addEventListener('click', handleSelfResetSubmit);

  const btnResetFinish = document.getElementById('btn-reset-finish');
  if (btnResetFinish) {
    btnResetFinish.addEventListener('click', () => {
      closeModals();
      const phoneFormEl = document.getElementById('phone-login-form');
      const toggleBtnEl = document.getElementById('toggle-passcode-view-btn');
      const loginFormEl = document.getElementById('login-form');
      const resetNameVal = document.getElementById('reset-name-input')?.value || '';

      if (phoneFormEl) phoneFormEl.classList.add('hidden');
      if (toggleBtnEl?.parentElement) toggleBtnEl.parentElement.classList.add('hidden');
      if (loginFormEl) loginFormEl.classList.remove('hidden');

      const pwLeader = document.getElementById('password-leader-lookup');
      if (pwLeader && resetNameVal) pwLeader.value = resetNameVal;

      const pwInput = document.getElementById('admin-passcode');
      if (pwInput) {
        pwInput.value = '';
        pwInput.focus();
      }
    });
  }

  // Leaders Bulk Selection & Actions
  const selectAllLeaders = document.getElementById('select-all-leaders');
  if (selectAllLeaders) {
    selectAllLeaders.addEventListener('change', (e) => {
      const checked = e.target.checked;
      const rowChecks = document.querySelectorAll('.leader-row-check');
      rowChecks.forEach(cb => {
        cb.checked = checked;
        const id = cb.dataset.id;
        if (id) {
          if (checked) selectedLeaderIds.add(id);
          else selectedLeaderIds.delete(id);
        }
      });
      updateLeadersBulkBar();
    });
  }

  const btnBulkDeselect = document.getElementById('btn-bulk-deselect');
  if (btnBulkDeselect) {
    btnBulkDeselect.addEventListener('click', () => {
      selectedLeaderIds.clear();
      document.querySelectorAll('.leader-row-check').forEach(cb => cb.checked = false);
      if (selectAllLeaders) {
        selectAllLeaders.checked = false;
        selectAllLeaders.indeterminate = false;
      }
      updateLeadersBulkBar();
    });
  }

  const btnBulkOnboard = document.getElementById('btn-bulk-onboard');
  if (btnBulkOnboard) {
    btnBulkOnboard.addEventListener('click', () => {
      if (selectedLeaderIds.size === 0) return;
      const validLeadersToOnboard = Array.from(selectedLeaderIds).map(id => leadersCache.find(l => l.id === id)).filter(l => l && canUserOnboardLeader(l));
      if (validLeadersToOnboard.length === 0) {
        alert("Permission denied: None of the selected leaders can be onboarded with your current permissions.");
        return;
      }
      openBulkOnboardModal(validLeadersToOnboard);
    });
  }

  const btnBulkRemove = document.getElementById('btn-bulk-remove');
  if (btnBulkRemove) {
    btnBulkRemove.addEventListener('click', async () => {
      if (selectedLeaderIds.size === 0) return;
      const validLeadersToRemove = Array.from(selectedLeaderIds).map(id => leadersCache.find(l => l.id === id)).filter(l => l && canUserDeleteLeader(l));
      if (validLeadersToRemove.length === 0) {
        alert("Permission denied: None of the selected leaders can be removed with your current permissions.");
        return;
      }
      if (!confirm(`Are you sure you want to remove the ${validLeadersToRemove.length} selected leader(s)?`)) return;
      const toRemoveIds = validLeadersToRemove.map(l => l.id);
      leadersCache = leadersCache.filter(l => !toRemoveIds.includes(l.id));
      selectedLeaderIds.clear();
      try { localStorage.setItem('local_ward_leaders', JSON.stringify(leadersCache)); } catch (_) { }
      renderLeadersTable();
      toRemoveIds.forEach(id => {
        deleteDoc(doc(db, "ward_leaders", id)).catch((e) => { if (isPermissionDenied(e)) alertLeadersDenied(LEADERS_REMOVE_DENIED_MSG); });
      });
    });
  }

  // Password Form Submit
  if (passcodeForm) passcodeForm.addEventListener('submit', handleLogin);
  document.getElementById('logout-btn').addEventListener('click', handleLogout);

  // Close leader action menus when clicking outside or when the page/table scrolls
  // (v1.2.59: menus are position:fixed, so they must not stay put after a scroll).
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.leader-action-dropdown-wrap')) {
      hideLeaderActionMenus();
    }
  });
  window.addEventListener('scroll', hideLeaderActionMenus, true);
  window.addEventListener('resize', hideLeaderActionMenus);

  initLoginLeaderLookup();
  checkAuth();
});

function initResetRecaptcha() {
  if (resetRecaptchaVerifier) return;
  try {
    resetRecaptchaVerifier = new RecaptchaVerifier(auth, 'reset-recaptcha-container', {
      size: 'invisible',
      callback: () => { }
    });
  } catch (e) {
    console.warn("Reset recaptcha verifier error:", e);
  }
}

function openSelfResetModal() {
  const modal = document.getElementById('reset-password-modal');
  if (!modal) return;

  const nameVal = document.getElementById('password-leader-lookup')?.value || document.getElementById('admin-name-lookup')?.value || '';
  const phoneVal = document.getElementById('admin-phone')?.value || '';

  const resetNameInput = document.getElementById('reset-name-input');
  const resetPhoneInput = document.getElementById('reset-phone-input');
  if (resetNameInput) resetNameInput.value = nameVal;
  if (resetPhoneInput) resetPhoneInput.value = phoneVal;

  document.getElementById('reset-step-1')?.classList.remove('hidden');
  document.getElementById('reset-step-2')?.classList.add('hidden');
  document.getElementById('reset-step-success')?.classList.add('hidden');

  const err1 = document.getElementById('reset-step1-error');
  const err2 = document.getElementById('reset-step2-error');
  if (err1) err1.classList.add('hidden');
  if (err2) err2.classList.add('hidden');

  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

async function handleSelfResetSendCode() {
  const nameInput = document.getElementById('reset-name-input');
  const phoneInput = document.getElementById('reset-phone-input');
  const err = document.getElementById('reset-step1-error');
  const btn = document.getElementById('btn-reset-send-code');

  const nameVal = (nameInput?.value || '').trim();
  const rawPhone = (phoneInput?.value || '').trim();

  if (!nameVal) {
    err.textContent = "Please type your first and last name.";
    err.classList.remove('hidden');
    nameInput?.focus();
    return;
  }

  const nameParts = nameVal.split(/\s+/).filter(Boolean);
  if (nameParts.length < 2) {
    err.textContent = "Please type both your first and last name.";
    err.classList.remove('hidden');
    nameInput?.focus();
    return;
  }
  if (!rawPhone) {
    err.textContent = "Please enter your mobile phone number.";
    err.classList.remove('hidden');
    phoneInput?.focus();
    return;
  }

  const phone = normalizePhone(rawPhone);
  if (phone.length < 11) {
    err.textContent = "Please enter a valid 10-digit mobile phone number.";
    err.classList.remove('hidden');
    phoneInput?.focus();
    return;
  }

  const cleanName = nameVal.toLowerCase();
  const matched = leadersCache.find(l => (l.displayName || '').toLowerCase() === cleanName) ||
    leadersCache.find(l => (l.displayName || '').toLowerCase().includes(cleanName));

  if (!matched && phone !== '+15084940905') {
    err.textContent = `Leader "${nameVal}" was not found. Please check spelling or contact an administrator.`;
    err.classList.remove('hidden');
    return;
  }

  if (matched && matched.phoneNumber) {
    const regPhone = normalizePhone(matched.phoneNumber);
    if (regPhone && regPhone !== phone) {
      err.textContent = `The phone number entered does not match the registered phone for ${matched.displayName}.`;
      err.classList.remove('hidden');
      return;
    }
  }

  err.classList.add('hidden');
  btn.disabled = true;
  btn.textContent = "Sending Verification Code...";

  try {
    initResetRecaptcha();
    resetConfirmationResult = await signInWithPhoneNumber(auth, phone, resetRecaptchaVerifier);

    document.getElementById('reset-step-1')?.classList.add('hidden');
    document.getElementById('reset-step-2')?.classList.remove('hidden');
    const targetText = document.getElementById('reset-code-target-text');
    if (targetText) targetText.textContent = `Verification code sent to ${phone}`;

    const codeInput = document.getElementById('reset-code-input');
    if (codeInput) {
      codeInput.value = '';
      codeInput.focus();
    }
  } catch (errCatch) {
    console.error("Reset SMS error:", errCatch);
    err.textContent = errCatch.message || "Failed to send verification text. Please try again.";
    err.classList.remove('hidden');
    if (resetRecaptchaVerifier) {
      try { resetRecaptchaVerifier.clear(); resetRecaptchaVerifier = null; } catch (_) { }
    }
  } finally {
    btn.disabled = false;
    btn.textContent = "Send Verification Code →";
  }
}

async function handleSelfResetSubmit() {
  const codeInput = document.getElementById('reset-code-input');
  const pwInput = document.getElementById('reset-new-pw-input');
  const confirmInput = document.getElementById('reset-confirm-pw-input');
  const err = document.getElementById('reset-step2-error');
  const btn = document.getElementById('btn-reset-submit');

  const code = (codeInput?.value || '').trim();
  const pw = (pwInput?.value || '').trim();
  const confirmPw = (confirmInput?.value || '').trim();

  if (!code || code.length < 6) {
    err.textContent = "Please enter the 6-digit verification code.";
    err.classList.remove('hidden');
    codeInput?.focus();
    return;
  }

  if (!pw || pw.length < 6) {
    err.textContent = "New password must be at least 6 characters.";
    err.classList.remove('hidden');
    pwInput?.focus();
    return;
  }

  if (pw !== confirmPw) {
    err.textContent = "Passwords do not match. Please re-enter.";
    err.classList.remove('hidden');
    confirmInput?.focus();
    return;
  }

  if (!resetConfirmationResult) {
    err.textContent = "Verification session expired. Please request a new code.";
    err.classList.remove('hidden');
    return;
  }

  err.classList.add('hidden');
  btn.disabled = true;
  btn.textContent = "Verifying & Updating...";

  try {
    await resetConfirmationResult.confirm(code);

    const nameVal = (document.getElementById('reset-name-input')?.value || '').trim();
    const phoneVal = normalizePhone(document.getElementById('reset-phone-input')?.value || '');
    const cleanName = nameVal.toLowerCase();

    let leader = leadersCache.find(l => (l.displayName || '').toLowerCase() === cleanName) ||
      leadersCache.find(l => (l.displayName || '').toLowerCase().includes(cleanName));

    if (!leader) {
      leader = leadersCache.find(l => normalizePhone(l.phoneNumber || '') === phoneVal);
    }

    // v1.2.91 (Duane 2026-11-23, #2): the new password goes only to the server (passkeyApi /password/set) with this
    // text-message sign-in; the server picks the active leader whose phone matches the verified number. No hash here.
    const now = new Date().toISOString();

    if (leader) {
      leader.updatedAt = now;
    } // v1.2.93 (cleanup item 2): no owner re-seed here; the server matches the verified phone to the leader's record.
    try {
      const resetIdToken = auth.currentUser ? await auth.currentUser.getIdToken() : '';
      await setLeaderPassword({ leaderId: '', password: pw }, resetIdToken);
      if (leader) {
        const { passwordHash: _droppedHash, ...rest } = leader;
        const idx = leadersCache.findIndex(l => l.id === leader.id);
        if (idx >= 0) leadersCache[idx] = { ...rest, hasPassword: true };
        try { localStorage.setItem('local_ward_leaders', JSON.stringify(leadersCache)); } catch (_) { }
      }
    } catch (setErr) {
      console.warn("Reset password server warning:", (setErr && setErr.status) || 'error');
      err.textContent = (setErr && setErr.message) || "Your password could not be saved. Please try again.";
      err.classList.remove('hidden');
      return;
    }

    document.getElementById('reset-step-2')?.classList.add('hidden');
    document.getElementById('reset-step-success')?.classList.remove('hidden');
  } catch (errCatch) {
    console.error("Reset confirm error:", errCatch);
    err.textContent = "Incorrect or expired verification code. Please try again.";
    err.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.textContent = "Set New Password ✓";
  }
}

function initLoginLeaderLookup() {
  const nameInput = document.getElementById('admin-name-lookup');
  if (!nameInput) return;

  // v1.2.63: no live name lookup, verified badge, or datalist. Matching runs only at submit.
  function updateDatalist() { /* authorized-leaders-datalist removed */ }

  // Pre-load leaders from localStorage if available
  try {
    const saved = JSON.parse(localStorage.getItem('local_ward_leaders') || '[]');
    if (saved.length > 0 && leadersCache.length === 0) {
      leadersCache = saved.map(l => ({ ...l, role: resolveLeaderRole(l), org: getLeaderOrg(l) }));
    }
  } catch (_) { }
  updateDatalist();

  // Async refresh from Firestore
  getDocs(collection(db, "ward_leaders")).then(snap => {
    if (!snap.empty) {
      leadersCache = [];
      snap.forEach(d => {
        const item = { id: d.id, ...d.data() };
        const resolvedRole = resolveLeaderRole(item);
        const resolvedOrg = getLeaderOrg(item);
        if (item.role !== resolvedRole || item.org !== resolvedOrg) {
          item.role = resolvedRole;
          item.org = resolvedOrg;
          setDoc(doc(db, "ward_leaders", d.id), { role: resolvedRole, org: resolvedOrg }, { merge: true }).catch(() => { });
        }
        leadersCache.push(item);
      });
      // v1.2.93 (cleanup item 2): no hard-coded owner entry added to the pre-sign-in list.
      try { localStorage.setItem('local_ward_leaders', JSON.stringify(leadersCache)); } catch (_) { }
      updateDatalist();
    }
  }).catch((e) => { console.warn("Pre-sign-in leader list unavailable:", e); leadersPreAuthFailed = true; });
}


// 2026-11-20: Bishopric Hub-style sign-in tabs (Phone Text (SMS) | Password Sign-In).
// Wiring only: each tab clicks the existing phone/password toggle button, and the active tab
// follows whichever form is visible (logout and password-reset flows also switch forms).
function initLoginTabs() {
  const tabBtns = Array.from(document.querySelectorAll('[data-login-tab]'));
  const phoneFormEl = document.getElementById('phone-login-form');
  const passcodeFormEl = document.getElementById('login-form');
  const toPasswordBtn = document.getElementById('toggle-passcode-view-btn');
  const toPhoneBtn = document.getElementById('toggle-phone-view-btn');
  if (!tabBtns.length || !phoneFormEl || !passcodeFormEl || !toPasswordBtn || !toPhoneBtn) return;
  const syncTabs = () => {
    const pwActive = !passcodeFormEl.classList.contains('hidden');
    tabBtns.forEach(btn => {
      const active = (btn.dataset.loginTab === 'password') === pwActive;
      btn.classList.toggle('active-tab', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
      btn.tabIndex = active ? 0 : -1;
    });
  };
  const selectTab = (mode) => {
    const pwActive = !passcodeFormEl.classList.contains('hidden');
    if (mode === 'password' && !pwActive) toPasswordBtn.click();
    if (mode !== 'password' && pwActive) toPhoneBtn.click();
    syncTabs();
  };
  tabBtns.forEach((btn, idx) => {
    btn.addEventListener('click', () => selectTab(btn.dataset.loginTab));
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const nextBtn = tabBtns[(idx + 1) % tabBtns.length];
        nextBtn.focus();
        selectTab(nextBtn.dataset.loginTab);
      }
    });
  });
  new MutationObserver(syncTabs).observe(passcodeFormEl, { attributes: true, attributeFilter: ['class'] });
  syncTabs();
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initLoginTabs);
} else {
  initLoginTabs();
}
