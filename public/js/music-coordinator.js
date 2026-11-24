import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
  getFirestore,
  collection,
  getDocs,
  getDoc,
  setDoc,
  doc,
  onSnapshot,
  query,
  where
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import {
  getAuth,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  signInWithCustomToken,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { loginWithCloudPasskey } from "./passkey-client.js?v=1.2.93";

// ======================== FIREBASE CONFIGURATION ========================
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

const MUSIC_PLANNER_VERSION = "1.2.93";
{ const gv = document.getElementById("music-gate-version-label"); if (gv) gv.textContent = `Music Planner • Version ${MUSIC_PLANNER_VERSION}`; } // v1.2.83: version on sign-in screen

const BISHOPRIC_IDS = new Set([
  "duane_harris",
  "john_truscott",
  "garrett_bourne",
  "cole_houston",
  "brian_mcdonald"
]);

// Authorized Roster: Ward Music Coordinator (Mio Cowden) + Blackstone Ward Bishopric
const MUSIC_AUTHORIZED_ROSTER = [
  { id: "mio_cowden", name: "Mio Cowden", shortName: "Mio Cowden", lastName: "Cowden", role: "Ward Music Coordinator", defaultPhone: "", email: "" },
  { id: "duane_harris", name: "Duane Harris", shortName: "Bishop Harris", lastName: "Harris", role: "Bishop", defaultPhone: "+15084940905", email: "tueini@gmail.com" },
  { id: "john_truscott", name: "John Truscott", shortName: "John Truscott", lastName: "Truscott", role: "1st Counselor", defaultPhone: "", email: "" },
  { id: "garrett_bourne", name: "Garrett Bourne", shortName: "Garrett Bourne", lastName: "Bourne", role: "2nd Counselor", defaultPhone: "", email: "" },
  { id: "cole_houston", name: "Cole Houston", shortName: "Cole Houston", lastName: "Houston", role: "Ward Clerk", defaultPhone: "", email: "" },
  { id: "brian_mcdonald", name: "Brian McDonald", shortName: "Brian McDonald", lastName: "McDonald", role: "Executive Secretary", defaultPhone: "", email: "mcdonaldlds830@gmail.com" }
];

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ROTATING_CONDUCTORS = ["Duane Harris", "John Truscott", "Garrett Bourne"];

const DEFAULT_SACRAMENT_START_TIMES = {
  "2025": "10:30 AM",
  "2026": "12:00 PM",
  "2027": "9:00 AM"
};

// ======================== APPLICATION STATE ========================
let seedData = null;
let monthsMap = {};
let sundaysMap = {};
let sacramentStartTimesMap = { ...DEFAULT_SACRAMENT_START_TIMES };
let customMaxSacYear = 2027;
let accompanistsList = [];
let choristersList = [];
let editingAccompanistIdx = null;
let editingChoristerIdx = null;

let hymnsBankState = {
  hymns: []
};
let hymnsModalSearch = "";
let hymnsModalSort = "page_en_asc";

let selectedYear = 2026;
let selectedMonth = 11;
let currentMusicUser = null;
let wardLeadersPool = [];
let smsConfirmationResult = null;
let saveDebounceTimer = null;
let openDropdownKey = null; // e.g. "hymn__2026-11-15__openingHymn" | "chor__2026-11-15" | "acc__2026-11-15"
let selectedMusicSundayDate = null; // v1.2.88: active Sunday tab (YYYY-MM-DD)

// ======================== HELPERS ========================
function escapeHtml(str) {
  if (typeof str !== "string") return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getTodayIsoEastern() {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(new Date());
    const y = parts.find(p => p.type === "year")?.value || "2026";
    const m = parts.find(p => p.type === "month")?.value || "11";
    const d = parts.find(p => p.type === "day")?.value || "01";
    return `${y}-${m}-${d}`;
  } catch (_) {
    return new Date().toISOString().split("T")[0];
  }
}

function formatReadableDate(dateStr) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric"
  });
}

function formatShortDate(dateStr) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function normalizePhone(phoneStr) {
  if (!phoneStr) return "";
  const digits = String(phoneStr).replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return String(phoneStr).startsWith("+") ? String(phoneStr) : `+${digits}`;
}

// 2026-11-20 (Duane): personal leader passwords (ward_leaders.passwordHash) are disabled for now.
// 2026-11-23 (Duane, #3): the temporary master password is retired, so the Password tab signs no one in here.
const PERSONAL_LEADER_PASSWORDS_DISABLED = true;

async function computeSha256(text) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function isMusicCoordinatorCalling(roleOrCalling) {
  const clean = String(roleOrCalling || "").trim().toLowerCase();
  if (!clean) return false;
  return (
    clean.includes("music coordinator") ||
    clean.includes("ward music") ||
    clean.includes("music chair") ||
    clean.includes("music director") ||
    clean === "wmc"
  );
}

function findAuthorizedMusicUser(rawInput) {
  const cleaned = String(rawInput || "").trim().toLowerCase();
  if (!cleaned || cleaned.length < 2) return null;

  for (const m of MUSIC_AUTHORIZED_ROSTER) {
    if (
      m.name.toLowerCase() === cleaned ||
      m.lastName.toLowerCase() === cleaned ||
      m.shortName.toLowerCase() === cleaned ||
      cleaned.includes(m.lastName.toLowerCase())
    ) {
      return m;
    }
  }

  // Also check Firestore ward_leaders for anyone holding the Ward Music Coordinator calling
  if (Array.isArray(wardLeadersPool)) {
    for (const l of wardLeadersPool) {
      const dn = String(l.displayName || l.name || "").trim();
      const dnLower = dn.toLowerCase();
      const roleStr = String(l.calling || l.role || l.title || "").trim();
      if (!dnLower) continue;
      const nameParts = dnLower.split(/\s+/);
      const lastPart = nameParts[nameParts.length - 1] || "";
      const matchesName = dnLower === cleaned || (lastPart.length >= 3 && cleaned.includes(lastPart));
      if (matchesName && (isMusicCoordinatorCalling(roleStr) || dnLower.includes("cowden"))) {
        return {
          id: l.id || dnLower.replace(/\s+/g, "_"),
          name: dn,
          shortName: dn,
          lastName: lastPart,
          role: roleStr || "Ward Music Coordinator",
          defaultPhone: l.phone || l.phoneNumber || l.mobile || "",
          email: l.email || ""
        };
      }
    }
  }
  return null;
}

// ======================== SEASONAL THEME & PARALLAX ========================
function resolveCurrentSeason(date = new Date()) {
  try {
    const month = Number(new Intl.DateTimeFormat("en-US", { month: "numeric", timeZone: "America/New_York" }).format(date));
    return month === 12 || month <= 2 ? "winter" : month <= 5 ? "spring" : month <= 8 ? "summer" : "fall";
  } catch (_) {
    return "fall";
  }
}

function initSeasonalParallax() {
  const seasonColors = { fall: "#FAF6EF", winter: "#EEF5FC", spring: "#F1F7EC", summer: "#FFF9E7" };
  const params = new URLSearchParams(window.location.search);
  const paramSeason = params.get("season");
  const activeSeason = ["fall", "winter", "spring", "summer"].includes(paramSeason)
    ? paramSeason
    : resolveCurrentSeason();

  document.body.dataset.season = activeSeason;
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  if (themeMeta && seasonColors[activeSeason]) {
    themeMeta.setAttribute("content", seasonColors[activeSeason]);
  }

  const gateWrapper = document.getElementById("music-gate-wrapper");
  const sceneLayer = document.getElementById("bish-gate-scene-image");
  const gateCard = document.getElementById("bish-gate-card");

  let pointerX = 0;
  let pointerY = 0;
  let wheelOffset = 0;
  let framePending = false;

  function updateParallax() {
    framePending = false;
    const scrollY = window.scrollY || window.pageYOffset || 0;
    if (gateWrapper && !gateWrapper.classList.contains("hidden")) {
      if (sceneLayer) {
        const bgScrollY = Math.max(-130, Math.min(130, scrollY * 0.48 + wheelOffset * 0.55));
        const bgShiftX = (pointerX * 42).toFixed(2);
        const bgShiftY = (bgScrollY + pointerY * 30).toFixed(2);
        sceneLayer.style.transform = `translate3d(${bgShiftX}px, ${bgShiftY}px, 0) scale(1.1)`;
      }
      if (gateCard) {
        const cardScrollY = Math.max(-36, Math.min(36, -scrollY * 0.14 - wheelOffset * 0.18));
        const cardShiftX = (pointerX * -12).toFixed(2);
        const cardShiftY = (cardScrollY + pointerY * -10).toFixed(2);
        gateCard.style.transform = `translate3d(${cardShiftX}px, ${cardShiftY}px, 0)`;
      }
    }
  }

  function queueParallax() {
    if (!framePending) {
      framePending = true;
      requestAnimationFrame(updateParallax);
    }
  }

  window.addEventListener("scroll", queueParallax, { passive: true });
  window.addEventListener("resize", queueParallax, { passive: true });
  window.addEventListener("wheel", (e) => {
    if (gateWrapper && !gateWrapper.classList.contains("hidden")) {
      wheelOffset = Math.max(-110, Math.min(110, wheelOffset + e.deltaY * 0.32));
      queueParallax();
    }
  }, { passive: true });
  window.addEventListener("pointermove", (e) => {
    if (gateWrapper && !gateWrapper.classList.contains("hidden") && window.innerWidth > 760) {
      pointerX = (e.clientX / window.innerWidth - 0.5) * -1;
      pointerY = (e.clientY / window.innerHeight - 0.5) * -1;
      queueParallax();
    }
  }, { passive: true });

  queueParallax();
}

// ======================== AUTHENTICATION & LOCKED GATE ========================
async function loadWardLeadersPool() {
  try {
    const snap = await getDocs(collection(db, "ward_leaders"));
    const list = [];
    snap.forEach(d => list.push({ id: d.id, ...d.data() }));
    wardLeadersPool = list;
  } catch (err) {
    console.warn("Could not fetch ward_leaders collection:", err);
  }
}

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
// v1.2.69: after an SMS sign-in, bind this session to the caller's own active ward_leaders record (if any).
async function bindVerifiedPhoneSession() {
  try {
    const phone = auth.currentUser?.phoneNumber || "";
    if (!phone) return false;
    const mine = (await findLeadersByVerifiedPhone(phone)).filter(l => l.active !== false);
    if (mine.length) return await bindLeaderSession(mine[0].id, "music");
    console.info("No ward_leaders record for this verified phone; cloud saves need a passkey sign-in.");
  } catch (e) {
    console.info("Phone session bind skipped:", e && e.code ? e.code : e);
  }
  return false;
}
// v1.2.69: saves to shared site data need a passkey or text-message sign-in once the tightened rules are live.
const CLOUD_SAVE_DENIED_MSG = "Saved on this device only. Saving to the shared site now needs a passkey (Touch ID) or text-message sign-in by a registered leader; password sign-ins can't save. Please sign in again with your passkey or a text code.";
let cloudSaveDeniedAt = 0;
function notifyCloudSaveDenied(err) {
  if (!err || err.code !== "permission-denied") return;
  const now = Date.now();
  if (now - cloudSaveDeniedAt < 10000) return;
  cloudSaveDeniedAt = now;
  alert(CLOUD_SAVE_DENIED_MSG);
}

function readSSOCookie() {
  try {
    const match = document.cookie.match(/(?:^|;\s*)ward_auth_session=([^;]*)/);
    if (!match) return null;
    return JSON.parse(decodeURIComponent(match[1]));
  } catch (_) {
    return null;
  }
}

function writeSSOCookie(memberObj) {
  try {
    // Only write the cross-subdomain Bishopric/Ward SSO cookie if the user is in the Bishopric.
    // The Ward Music Coordinator session remains isolated to the /music page (`musicPlannerAuth`).
    if (!memberObj || !BISHOPRIC_IDS.has(memberObj.id)) return;
    const payload = encodeURIComponent(JSON.stringify({
      displayName: memberObj.name,
      name: memberObj.name,
      role: memberObj.role,
      email: memberObj.email || "",
      ts: Date.now()
    }));
    const isBwDomain = window.location.hostname.endsWith("blackstoneward.org");
    const domainPart = isBwDomain ? "; domain=.blackstoneward.org" : "";
    document.cookie = `ward_auth_session=${payload}; path=/; max-age=43200; SameSite=Lax${domainPart}`;
  } catch (_) {}
}

function readSavedPasskeyData() {
  try {
    const local = localStorage.getItem("wardPasskeyRegistered");
    if (local) {
      const parsed = JSON.parse(local);
      if (parsed?.rawId && Array.isArray(parsed.rawId)) return parsed;
    }
  } catch (_) {}
  try {
    const match = document.cookie.match(/(?:^|;\s*)ward_passkey_cred=([^;]*)/);
    if (match) {
      const parsed = JSON.parse(decodeURIComponent(match[1]));
      if (parsed?.rawId && Array.isArray(parsed.rawId)) {
        localStorage.setItem("wardPasskeyRegistered", JSON.stringify(parsed));
        return parsed;
      }
    }
  } catch (_) {}
  return null;
}

function writeSavedPasskeyData(rawIdArr, memberObj) {
  try {
    const data = {
      rawId: rawIdArr,
      profile: {
        id: memberObj.id,
        displayName: memberObj.name,
        role: memberObj.role,
        email: memberObj.email || ""
      },
      registeredAt: new Date().toISOString()
    };
    const json = JSON.stringify(data);
    localStorage.setItem("wardPasskeyRegistered", json);
    const isBwDomain = window.location.hostname.endsWith("blackstoneward.org");
    const domainPart = isBwDomain ? "; domain=.blackstoneward.org" : "";
    document.cookie = `ward_passkey_cred=${encodeURIComponent(json)}; path=/; max-age=31536000; SameSite=Lax${domainPart}`;
  } catch (_) {}
}

function getRegisteredPhoneForMember(memberObj) {
  if (!memberObj) return "";
  if (memberObj.defaultPhone) return normalizePhone(memberObj.defaultPhone);
  const rosterItem = MUSIC_AUTHORIZED_ROSTER.find(m => m.id === memberObj.id);
  if (rosterItem?.defaultPhone) return normalizePhone(rosterItem.defaultPhone);
  if (Array.isArray(wardLeadersPool)) {
    const leaderDoc = wardLeadersPool.find(l => {
      const dn = String(l.displayName || l.name || "").toLowerCase();
      return dn === memberObj.name.toLowerCase() || (memberObj.lastName && dn.includes(memberObj.lastName.toLowerCase()));
    });
    const rawP = leaderDoc?.phone || leaderDoc?.phoneNumber || leaderDoc?.mobile || "";
    if (rawP) return normalizePhone(rawP);
  }
  return "";
}

function unlockMusicPlanner(memberObj) {
  const canonicalMember = MUSIC_AUTHORIZED_ROSTER.find(m => m.id === memberObj?.id) || memberObj;
  currentMusicUser = canonicalMember;
  const sessionPayload = JSON.stringify({
    ...canonicalMember,
    unlockedAt: new Date().toISOString()
  });
  sessionStorage.setItem("musicPlannerAuth", sessionPayload);
  localStorage.setItem("musicPlannerAuth", sessionPayload);
  localStorage.setItem("musicLastMember", sessionPayload);
  writeSSOCookie(canonicalMember);

  const gateWrapper = document.getElementById("music-gate-wrapper");
  const appWrapper = document.getElementById("music-app-wrapper");
  const headerUserBar = document.getElementById("music-header-user-bar");
  if (gateWrapper) gateWrapper.classList.add("hidden");
  if (appWrapper) appWrapper.classList.remove("hidden");
  if (headerUserBar) {
    headerUserBar.classList.remove("hidden");
    headerUserBar.classList.add("flex");
  }

  const pillName = document.getElementById("music-active-user-name");
  if (pillName) {
    pillName.textContent = `${canonicalMember.name} (${canonicalMember.role})`;
  }

  window.scrollTo({ top: 0, behavior: "smooth" });
  renderMusicPlanner();
}

function lockMusicPlanner() {
  sessionStorage.removeItem("musicPlannerAuth");
  localStorage.removeItem("musicPlannerAuth");
  currentMusicUser = null;

  const gateWrapper = document.getElementById("music-gate-wrapper");
  const appWrapper = document.getElementById("music-app-wrapper");
  const headerUserBar = document.getElementById("music-header-user-bar");
  if (appWrapper) appWrapper.classList.add("hidden");
  if (gateWrapper) gateWrapper.classList.remove("hidden");
  if (headerUserBar) {
    headerUserBar.classList.add("hidden");
    headerUserBar.classList.remove("flex");
  }

  const pwInput = document.getElementById("music-gate-password");
  if (pwInput) pwInput.value = "";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// v1.2.83: a saved unlock in browser storage is client-editable, so it is restored only when Firebase still has a live
// sign-in (Touch ID passkey or text code) for the same leader. A personal-password session alone ('pw_') never counts,
// and ward-password unlocks (no Firebase sign-in) do not survive a reload.
function waitForAuthReady() {
  return new Promise(resolve => {
    const unsub = onAuthStateChanged(auth, u => { try { unsub(); } catch (_) {} resolve(u || null); });
  });
}
async function liveSignInLeaderName() {
  const user = await waitForAuthReady();
  if (!user) return "";
  try {
    const claims = (await user.getIdTokenResult()).claims || {};
    if (claims.pw || String(user.uid || "").startsWith("pw_")) return "";
    if (claims.leaderId) {
      if (claims.displayName) return String(claims.displayName);
      const snap = await getDoc(doc(db, "ward_leaders", String(claims.leaderId)));
      if (snap.exists()) return String(snap.data().displayName || snap.data().name || "");
      return "";
    }
    if (user.phoneNumber) {
      const mine = (await findLeadersByVerifiedPhone(user.phoneNumber)).filter(l => l.active !== false);
      const l = mine[0];
      if (l) return String(l.displayName || l.name || `${l.firstName || ""} ${l.lastName || ""}`.trim());
    }
  } catch (e) {
    console.info("Saved unlock not restored (sign-in check failed):", e && e.code ? e.code : e);
  }
  return "";
}
async function restoreSavedMusicUnlock(savedMusic) {
  const liveName = await liveSignInLeaderName();
  const live = liveName ? findAuthorizedMusicUser(liveName) : null;
  const saved = findAuthorizedMusicUser(savedMusic.name);
  if (live && saved && (live.id ? live.id === saved.id : live.name === saved.name)) {
    unlockMusicPlanner(live);
    return;
  }
  sessionStorage.removeItem("musicPlannerAuth");
  localStorage.removeItem("musicPlannerAuth");
}

function initMusicLoginGate() {
  // 1. Check saved session in sessionStorage / localStorage (either musicPlannerAuth or bishopricHubAuth)
  try {
    const savedMusic = JSON.parse(
      sessionStorage.getItem("musicPlannerAuth") ||
      localStorage.getItem("musicPlannerAuth") ||
      sessionStorage.getItem("bishopricHubAuth") ||
      localStorage.getItem("bishopricHubAuth") ||
      "null"
    );
    if (savedMusic && savedMusic.name && findAuthorizedMusicUser(savedMusic.name)) {
      restoreSavedMusicUnlock(savedMusic); // v1.2.83: only with a live sign-in for the same leader
    }
  } catch (_) {}

  // 2. Check SSO cookie (v1.2.83: display and name prefill only; never unlock from the cookie)
  const ssoUser = readSSOCookie();
  if (ssoUser) {
    const matched = findAuthorizedMusicUser(ssoUser.displayName || ssoUser.name || "");
    if (matched) {
      const banner = document.getElementById("music-gate-sso-banner");
      const nameEl = document.getElementById("music-gate-sso-name");
      const roleEl = document.getElementById("music-gate-sso-role");
      const btnContinue = document.getElementById("btn-music-sso-continue");
      if (banner && nameEl && btnContinue) {
        nameEl.textContent = `${matched.name} (${matched.role})`;
        if (roleEl) roleEl.textContent = matched.role;
        banner.classList.remove("hidden");
        const prefillMusicNames = () => {
          const smsName = document.getElementById("music-sms-name");
          const pwName = document.getElementById("music-gate-name");
          if (smsName && !smsName.value.trim()) smsName.value = matched.name;
          if (pwName && !pwName.value.trim()) pwName.value = matched.name;
        };
        prefillMusicNames();
        btnContinue.addEventListener("click", () => {
          prefillMusicNames();
          const smsForm = document.getElementById("music-gate-sms-form");
          const smsVisible = smsForm && !smsForm.classList.contains("hidden");
          const target = document.getElementById(smsVisible ? "music-sms-name" : "music-gate-name")
            || document.getElementById("btn-music-gate-passkey");
          target?.scrollIntoView({ behavior: "smooth", block: "center" });
          if (target && typeof target.focus === "function") target.focus();
        });
      }
    }
  }

  // 3. Auth mode radio buttons (Password vs SMS)
  const modeRadios = document.querySelectorAll('input[name="music_gate_auth_mode"]');
  const pwForm = document.getElementById("music-gate-pw-form");
  const smsForm = document.getElementById("music-gate-sms-form");
  modeRadios.forEach(radio => {
    radio.addEventListener("change", () => {
      const pwNameEl = document.getElementById("music-gate-name");
      const smsNameEl = document.getElementById("music-sms-name");
      if (radio.value === "sms" && radio.checked) {
        if (pwNameEl && smsNameEl && !smsNameEl.value.trim() && pwNameEl.value.trim()) {
          smsNameEl.value = pwNameEl.value.trim();
        }
        pwForm?.classList.add("hidden");
        smsForm?.classList.remove("hidden");
      } else if (radio.value === "password" && radio.checked) {
        if (smsNameEl && pwNameEl && !pwNameEl.value.trim() && smsNameEl.value.trim()) {
          pwNameEl.value = smsNameEl.value.trim();
        }
        smsForm?.classList.add("hidden");
        pwForm?.classList.remove("hidden");
      }
    });
  });

  // 4. Live Name Verification Indicator
  const nameInput = document.getElementById("music-gate-name");
  const matchBox = document.getElementById("music-gate-match");
  const matchText = document.getElementById("music-gate-match-text");
  const pwError = document.getElementById("music-gate-pw-error");

  if (nameInput) {
    nameInput.addEventListener("input", () => {
      pwError?.classList.add("hidden");
      const matched = findAuthorizedMusicUser(nameInput.value);
      if (matched && matchBox && matchText) {
        matchText.textContent = `${matched.name} • ${matched.role}`;
        matchBox.classList.remove("hidden");
      } else if (matchBox) {
        matchBox.classList.add("hidden");
      }
    });
  }

  // 5. Password Visibility Toggle
  const pwInput = document.getElementById("music-gate-password");
  const togglePwBtn = document.getElementById("btn-toggle-music-pw");
  if (togglePwBtn && pwInput) {
    togglePwBtn.addEventListener("click", () => {
      const isPw = pwInput.type === "password";
      pwInput.type = isPw ? "text" : "password";
      togglePwBtn.textContent = isPw ? "Hide" : "Show";
      togglePwBtn.setAttribute("aria-pressed", isPw ? "true" : "false");
    });
  }

  // 6. Password Submit Handler
  if (pwForm) {
    pwForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      pwError?.classList.add("hidden");

      if (wardLeadersPool.length === 0) {
        await loadWardLeadersPool();
      }

      const rawName = (nameInput?.value || "").trim();
      const rawPw = (pwInput?.value || "").trim();

      const matchedMember = findAuthorizedMusicUser(rawName);
      if (!matchedMember) {
        if (pwError) {
          pwError.textContent = "Access is restricted to the Ward Music Coordinator (Mio Cowden) and the Blackstone Ward Bishopric. Please enter your first and last name.";
          pwError.classList.remove("hidden");
        }
        nameInput?.focus();
        return;
      }

      if (!rawPw) {
        if (pwError) {
          pwError.textContent = "Please enter your password.";
          pwError.classList.remove("hidden");
        }
        pwInput?.focus();
        return;
      }

      const submitBtn = document.getElementById("btn-music-pw-submit");
      if (submitBtn) submitBtn.textContent = "Verifying Credentials...";

      try {
        // 2026-11-23 (Duane, #2/#3): the master password is retired and the browser no longer hashes or compares
        // passwords. Personal leader passwords are not enabled on the Music Planner (PERSONAL_LEADER_PASSWORDS_DISABLED).

        if (pwError) {
          pwError.textContent = "Incorrect password. Please try again, or use Phone Text (SMS).";
          pwError.classList.remove("hidden");
        }
      } catch (err) {
        if (pwError) {
          pwError.textContent = "Credential verification error: " + err.message;
          pwError.classList.remove("hidden");
        }
      } finally {
        if (submitBtn) submitBtn.innerHTML = "Verify &amp; Enter Music Planner &rarr;";
      }
    });
  }

  // 7. Passkey / Touch ID Handler
  const passkeyBtn = document.getElementById("btn-music-gate-passkey");
  const passkeyHint = document.getElementById("music-gate-passkey-hint");
  if (passkeyBtn) {
    passkeyBtn.addEventListener("click", async () => {
      passkeyHint?.classList.add("hidden");
      if (!window.PublicKeyCredential) {
        if (passkeyHint) {
          passkeyHint.textContent = "Biometrics / Passkeys are not supported in this browser. Please use Phone SMS below.";
          passkeyHint.classList.remove("hidden");
        }
        return;
      }

      const typedName =
        (document.getElementById("music-gate-name")?.value || "").trim() ||
        (document.getElementById("music-sms-name")?.value || "").trim();
      const typedMember = typedName ? findAuthorizedMusicUser(typedName) : null;

      try {
        const result = await loginWithCloudPasskey({
          leaderName: typedMember?.name || ""
        });
        if (result?.verified && result.profile) {
          const matchedMember = findAuthorizedMusicUser(result.profile.displayName || result.profile.name || "");
          if (!matchedMember) {
            if (passkeyHint) {
              passkeyHint.textContent = "This passkey is not authorized for the Ward Music Planner.";
              passkeyHint.classList.remove("hidden");
            }
            return;
          }
          if (result.customToken) {
            await signInWithCustomToken(auth, result.customToken).catch(() => { });
          }
          unlockMusicPlanner(matchedMember);
          return;
        }
      } catch (err) {
        if (err?.name === "AbortError") return;
        if (passkeyHint) {
          passkeyHint.textContent = "No cloud passkey found on this device yet. Please sign in with Phone SMS below.";
          passkeyHint.classList.remove("hidden");
        }
      }
    });
  }

  // 8. Phone SMS Handler
  const smsStep1 = document.getElementById("music-sms-step-1");
  const smsStep2 = document.getElementById("music-sms-step-2");
  const smsError = document.getElementById("music-sms-error");
  const smsBackBtn = document.getElementById("btn-music-sms-back");
  const smsVerifyBtn = document.getElementById("btn-music-verify-sms");
  const smsCodeInput = document.getElementById("music-sms-code");

  const verifySmsCode = async () => {
    const code = (smsCodeInput?.value || "").replace(/\D/g, "").trim();
    if (!code || code.length < 6 || !smsConfirmationResult) {
      if (smsError) {
        smsError.textContent = "Please enter the 6-digit verification code.";
        smsError.classList.remove("hidden");
      }
      return;
    }
    try {
      await smsConfirmationResult.confirm(code);
      await bindVerifiedPhoneSession(); // v1.2.69
      unlockMusicPlanner(smsConfirmationResult._matchedMember || MUSIC_AUTHORIZED_ROSTER[0]);
    } catch (_) {
      if (smsError) {
        smsError.textContent = "Invalid or expired verification code.";
        smsError.classList.remove("hidden");
      }
    }
  };

  smsBackBtn?.addEventListener("click", () => {
    smsStep2?.classList.add("hidden");
    smsStep1?.classList.remove("hidden");
    smsError?.classList.add("hidden");
  });

  smsVerifyBtn?.addEventListener("click", verifySmsCode);

  if (smsForm) {
    smsForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      smsError?.classList.add("hidden");

      if (smsStep2 && !smsStep2.classList.contains("hidden")) {
        await verifySmsCode();
        return;
      }

      if (wardLeadersPool.length === 0) {
        await loadWardLeadersPool();
      }

      const rawName =
        (document.getElementById("music-sms-name")?.value || "").trim() ||
        (document.getElementById("music-gate-name")?.value || "").trim();
      const rawPhone = (document.getElementById("music-sms-phone")?.value || "").trim();

      const matchedMember = findAuthorizedMusicUser(rawName);
      if (!matchedMember) {
        if (smsError) {
          smsError.textContent = "Access Denied: Only the Ward Music Coordinator (Mio Cowden) and the Blackstone Ward Bishopric are authorized.";
          smsError.classList.remove("hidden");
        }
        return;
      }

      const phone = normalizePhone(rawPhone);
      if (!phone || phone.length < 11) {
        if (smsError) {
          smsError.textContent = "Please enter a valid 10-digit mobile phone number.";
          smsError.classList.remove("hidden");
        }
        return;
      }

      const registeredPhone = getRegisteredPhoneForMember(matchedMember);
      if (registeredPhone && registeredPhone !== phone) {
        if (smsError) {
          smsError.textContent = `The phone number entered does not match the registered phone on file for ${matchedMember.name}.`;
          smsError.classList.remove("hidden");
        }
        return;
      }

      const sendBtn = document.getElementById("btn-music-send-sms");
      if (sendBtn) sendBtn.textContent = "Verifying Phone...";

      try {
        if (window.musicRecaptchaVerifier) {
          try { window.musicRecaptchaVerifier.clear(); } catch (_) {}
          window.musicRecaptchaVerifier = null;
        }
        const recapEl = document.getElementById("music-recaptcha-container");
        if (recapEl) recapEl.innerHTML = "";

        window.musicRecaptchaVerifier = new RecaptchaVerifier(auth, "music-recaptcha-container", { size: "invisible" });
        smsConfirmationResult = await signInWithPhoneNumber(auth, phone, window.musicRecaptchaVerifier);
        smsConfirmationResult._matchedMember = matchedMember;
        smsStep1?.classList.add("hidden");
        smsStep2?.classList.remove("hidden");
        const note = document.getElementById("music-sms-sent-note");
        if (note) note.textContent = `6-digit code sent to ${phone}`;
        smsCodeInput?.focus();
      } catch (err) {
        if (registeredPhone && registeredPhone === phone) {
          unlockMusicPlanner(matchedMember);
          return;
        }
        if (smsError) {
          smsError.textContent = err.message || "Could not send SMS code. Please use Touch ID.";
          smsError.classList.remove("hidden");
        }
      } finally {
        if (sendBtn) sendBtn.innerHTML = "Send 6-Digit Verification Text &rarr;";
      }
    });
  }

  document.getElementById("btn-music-lock")?.addEventListener("click", lockMusicPlanner);
}

// ======================== HYMNS & SACRAMENT DATA SYNC WITH BISHOPRIC HUB ========================
function normalizeHymnRecord(rec, idx = 0) {
  const nameEn = String(rec?.name_en || rec?.hymn_name_en || "").trim();
  const pageEn = String(rec?.page_en ?? rec?.page_number_en ?? "").trim();
  const namePtRaw = String(rec?.name_pt || rec?.hymn_name_pt || "").trim();
  const pagePtRaw = String(rec?.page_pt ?? rec?.page_number_pt ?? "").trim();
  return {
    id: String(rec?.id || `hymn_${idx + 1}`),
    name_en: nameEn,
    page_en: pageEn,
    name_pt: namePtRaw || "NA",
    page_pt: pagePtRaw || "NA"
  };
}

function getHymnPageNumeric(rawPage) {
  const clean = String(rawPage ?? "").trim();
  if (!clean || clean.toUpperCase() === "NA") return 999999;
  const n = Number.parseFloat(clean);
  return Number.isFinite(n) ? n : 999999;
}

function getSortedHymnsByPageEn(list = hymnsBankState.hymns || []) {
  return [...list].sort((a, b) => {
    const pA = getHymnPageNumeric(a.page_en);
    const pB = getHymnPageNumeric(b.page_en);
    if (pA !== pB) return pA - pB;
    return String(a.name_en || "").localeCompare(String(b.name_en || ""), undefined, { sensitivity: "base" });
  });
}

function formatHymnDisplay(hymnObj) {
  if (!hymnObj) return "";
  if (typeof hymnObj === "string") return hymnObj.trim();
  const nameEn = String(hymnObj.name_en || "").trim();
  const pageEn = String(hymnObj.page_en ?? "").trim();
  const namePt = String(hymnObj.name_pt ?? "NA").trim() || "NA";
  const pagePt = String(hymnObj.page_pt ?? "NA").trim() || "NA";
  if (!nameEn && !pageEn) return "";
  return `${nameEn}, ${pageEn} • ${namePt}, ${pagePt}`;
}

function formatOrMatchHymnValue(rawVal) {
  const clean = String(rawVal || "").trim();
  if (!clean) return "";
  const hymns = hymnsBankState.hymns || [];
  if (!hymns.length) return clean;

  const exactDisplay = hymns.find(h => formatHymnDisplay(h).toLowerCase() === clean.toLowerCase());
  if (exactDisplay) return formatHymnDisplay(exactDisplay);

  // Upgrade legacy "<name_en>, <page_en> / PT: <page_pt>" or "<name_en>, <page_en> • ..."
  const legacyPtMatch = clean.match(/^(.+?),\s*(\d+)\s*(?:\/\s*PT:|•)/i);
  if (legacyPtMatch) {
    const pg = legacyPtMatch[2];
    const byPage = hymns.find(h => String(h.page_en) === pg);
    if (byPage) return formatHymnDisplay(byPage);
  }

  const numPrefixMatch = clean.match(/^#?(\d+)\s*[-–—:,]\s*(.+)$/);
  if (numPrefixMatch) {
    const pg = numPrefixMatch[1];
    const byPage = hymns.find(h => String(h.page_en) === pg);
    if (byPage) return formatHymnDisplay(byPage);
  }
  if (/^#?\d+$/.test(clean)) {
    const pg = clean.replace(/^#/, "");
    const byPage = hymns.find(h => String(h.page_en) === pg);
    if (byPage) return formatHymnDisplay(byPage);
  }
  const byName = hymns.find(h => String(h.name_en || "").toLowerCase() === clean.toLowerCase());
  if (byName) return formatHymnDisplay(byName);

  return clean;
}

function getBaselineMaxYear() {
  const currentEasternYear = Number(getTodayIsoEastern().slice(0, 4)) || 2026;
  return Math.max(2027, currentEasternYear + 1);
}

function getAvailableSacramentYears() {
  const baselineMax = getBaselineMaxYear();
  const maxYr = Math.max(baselineMax, customMaxSacYear || baselineMax);
  const years = [];
  for (let y = 2025; y <= maxYr; y++) {
    years.push(y);
  }
  return years;
}

function getSacramentStartTimeForYear(year) {
  const yrKey = String(year || "").trim();
  if (!yrKey) return "12:00 PM";
  const val = String(sacramentStartTimesMap[yrKey] ?? DEFAULT_SACRAMENT_START_TIMES[yrKey] ?? "").trim();
  return val || "TBD";
}

function getDefaultConductorForMonth(year, month) {
  const prevYear = month === 1 ? year - 1 : year;
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevKey = `${prevYear}-${String(prevMonth).padStart(2, "0")}`;
  const prevAssigned = monthsMap[prevKey]?.assignedConducting;
  const prevIdx = ROTATING_CONDUCTORS.indexOf(prevAssigned);
  if (prevIdx !== -1) {
    return ROTATING_CONDUCTORS[(prevIdx + 1) % ROTATING_CONDUCTORS.length];
  }
  return ROTATING_CONDUCTORS[month % ROTATING_CONDUCTORS.length];
}

function ensureSacramentMonthInitialized(year, month) {
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return;
  if (year === 2025 && month < 10) return;

  const mKey = `${year}-${String(month).padStart(2, "0")}`;
  if (!monthsMap[mKey]) {
    monthsMap[mKey] = {
      monthKey: mKey,
      assignedConducting: getDefaultConductorForMonth(year, month),
      theme: ""
    };
  }

  const assignedCond = monthsMap[mKey].assignedConducting || getDefaultConductorForMonth(year, month);
  const dt = new Date(year, month - 1, 1);
  let nthSunday = 0;

  while (dt.getMonth() === month - 1) {
    if (dt.getDay() === 0) {
      nthSunday += 1;
      const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
      if (!sundaysMap[dateStr]) {
        sundaysMap[dateStr] = {
          date: dateStr,
          monthKey: mKey,
          nthSunday,
          meetingType: nthSunday === 1 ? "Fast Sunday" : "Standard",
          specialNote: "",
          assignedConducting: assignedCond,
          actualConducting: assignedCond,
          presiding: "Bishop Harris",
          presidingCustom: "",
          speakerSlotCount: 3,
          speakers: ["", "", ""],
          speakerConfirmed: [false, false, false],
          openingHymn: "",
          sacramentHymn: "",
          intermediateType: "hymn",
          intermediateHymn: "",
          musicalNumber: "",
          closingHymn: "",
          openingPrayer: "",
          closingPrayer: "",
          organist: "",
          chorister: "",
          topicNote: "",
          hasWardBusiness: false,
          wardBusiness: {
            releases: [],
            callings: [],
            ordinations: [],
            baptisms: [],
            babyBlessings: [],
            moveIns: []
          },
          hasStakeBusiness: false,
          stakeBusinessNotes: ""
        };
      }
    }
    dt.setDate(dt.getDate() + 1);
  }
}

function ensureAllAvailableSacramentYearsInitialized() {
  getAvailableSacramentYears().forEach(yr => {
    const startM = yr === 2025 ? 10 : 1;
    for (let m = startM; m <= 12; m++) {
      ensureSacramentMonthInitialized(yr, m);
    }
  });
}

function isNoWardSacramentMeetingType(mType) {
  const clean = String(mType || "Standard").trim();
  return (
    clean === "Stake Conference" ||
    clean === "General Conference" ||
    clean === "No Ward Sacrament"
  );
}

function getNextWardSacramentSundayKey(todayIso = getTodayIsoEastern()) {
  const sortedDates = Object.keys(sundaysMap).sort();
  return (
    sortedDates.find(d => d >= todayIso && !isNoWardSacramentMeetingType(sundaysMap[d]?.meetingType)) ||
    sortedDates.find(d => d >= todayIso) ||
    "2026-11-15"
  );
}

function populateMusicDatalists() {
  const chorList = choristersList.length > 0 ? choristersList : (seedData?.choristers || []);
  const accList = accompanistsList.length > 0 ? accompanistsList : (seedData?.organists || []);
  const sortedHymns = getSortedHymnsByPageEn(hymnsBankState.hymns || []);

  const chorDl = document.getElementById("music-choristers-datalist");
  if (chorDl) {
    chorDl.innerHTML = chorList.map(c => `<option value="${escapeHtml(c)}"></option>`).join("");
  }

  const accDl = document.getElementById("music-accompanists-datalist");
  if (accDl) {
    accDl.innerHTML = accList.map(a => `<option value="${escapeHtml(a)}"></option>`).join("");
  }

  const hymDl = document.getElementById("music-hymns-datalist");
  if (hymDl) {
    hymDl.innerHTML = sortedHymns.map(h => {
      const disp = formatHymnDisplay(h);
      return `<option value="${escapeHtml(disp)}">${escapeHtml(h.name_pt && h.name_pt !== "NA" ? `PT: ${h.name_pt}` : "")}</option>`;
    }).join("");
  }
}

async function loadDataAndSyncFirestore() {
  try {
    let resp = await fetch(`/data/sacrament-seed.json?v=${MUSIC_PLANNER_VERSION}`);
    if (!resp.ok) {
      resp = await fetch(`https://bish.blackstoneward.org/data/sacrament-seed.json?v=${MUSIC_PLANNER_VERSION}`);
    }
    if (resp.ok) {
      seedData = await resp.json();
    }
  } catch (err) {
    console.warn("Could not load sacrament-seed.json:", err);
  }
  if (!seedData) {
    seedData = { months: {}, sundays: [], hymns: [], organists: [], choristers: [] };
  }

  accompanistsList = Array.isArray(seedData.organists) ? [...seedData.organists] : [];
  choristersList = Array.isArray(seedData.choristers) ? [...seedData.choristers] : [];
  monthsMap = { ...(seedData.months || {}) };
  sundaysMap = {};
  (seedData.sundays || []).forEach(s => {
    sundaysMap[s.date] = { ...s };
  });

  // Load Hymns seed
  try {
    let hymResp = await fetch(`/data/hymns-bank-seed.json?v=${MUSIC_PLANNER_VERSION}`);
    if (!hymResp.ok) {
      hymResp = await fetch(`https://bish.blackstoneward.org/data/hymns-bank-seed.json?v=${MUSIC_PLANNER_VERSION}`);
    }
    if (hymResp.ok) {
      const hymSeed = await hymResp.json();
      if (hymSeed && Array.isArray(hymSeed.hymns)) {
        hymnsBankState.hymns = getSortedHymnsByPageEn(
          hymSeed.hymns.map((r, i) => normalizeHymnRecord(r, i))
        );
      }
    }
  } catch (err) {
    console.warn("Could not load hymns-bank-seed.json:", err);
  }

  // Merge local caches
  try {
    const cachedSac = JSON.parse(localStorage.getItem("bishopric_sacrament_cache_v1") || "null");
    if (cachedSac) {
      if (Number.isFinite(Number(cachedSac.maxActiveYear))) {
        customMaxSacYear = Math.max(getBaselineMaxYear(), Number(cachedSac.maxActiveYear));
      }
      if (cachedSac.startTimes && typeof cachedSac.startTimes === "object") {
        sacramentStartTimesMap = { ...DEFAULT_SACRAMENT_START_TIMES, ...cachedSac.startTimes };
      }
      if (Array.isArray(cachedSac.accompanists)) accompanistsList = [...cachedSac.accompanists];
      if (Array.isArray(cachedSac.choristers)) choristersList = [...cachedSac.choristers];
      if (cachedSac.months) Object.assign(monthsMap, cachedSac.months);
      if (cachedSac.sundays) Object.assign(sundaysMap, cachedSac.sundays);
    }
    const cachedHymns = JSON.parse(localStorage.getItem("bishopric_hymns_bank_cache_v1") || "null");
    if (cachedHymns && Array.isArray(cachedHymns.hymns) && cachedHymns.hymns.length > 0) {
      hymnsBankState.hymns = getSortedHymnsByPageEn(
        cachedHymns.hymns.map((r, i) => normalizeHymnRecord(r, i))
      );
    }
  } catch (_) {}

  ensureAllAvailableSacramentYearsInitialized();

  const upcomingSunday = getNextWardSacramentSundayKey(getTodayIsoEastern());
  const [upY, upM] = upcomingSunday.split("-").map(Number);
  selectedYear = upY || 2026;
  selectedMonth = upM || 11;

  populateMusicDatalists();
  renderMusicPlanner();

  // Real-time Firestore listener for `home_content/bishopric_sacrament_v1`
  try {
    onSnapshot(doc(db, "home_content", "bishopric_sacrament_v1"), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (Number.isFinite(Number(data.maxActiveYear))) {
          customMaxSacYear = Math.max(getBaselineMaxYear(), Number(data.maxActiveYear));
        }
        if (data.startTimes && typeof data.startTimes === "object") {
          sacramentStartTimesMap = { ...DEFAULT_SACRAMENT_START_TIMES, ...data.startTimes };
        }
        if (Array.isArray(data.accompanists)) {
          accompanistsList = [...data.accompanists];
        }
        if (Array.isArray(data.choristers)) {
          choristersList = [...data.choristers];
        }
        monthsMap = { ...(seedData?.months || {}) };
        if (data.months) {
          Object.entries(data.months).forEach(([k, v]) => {
            monthsMap[k] = { ...(monthsMap[k] || {}), ...v };
          });
        }
        if (data.sundays) {
          Object.entries(data.sundays).forEach(([dKey, sVal]) => {
            sundaysMap[dKey] = { ...(sundaysMap[dKey] || {}), ...sVal };
          });
        }
        ensureAllAvailableSacramentYearsInitialized();
        localStorage.setItem(
          "bishopric_sacrament_cache_v1",
          JSON.stringify({
            months: monthsMap,
            sundays: sundaysMap,
            maxActiveYear: customMaxSacYear,
            startTimes: sacramentStartTimesMap,
            accompanists: accompanistsList,
            choristers: choristersList
          })
        );
        populateMusicDatalists();
        renderMusicPlanner();
        renderChoristersModal();
        renderAccompanistsModal();
      }
    });

    onSnapshot(doc(db, "home_content", "bishopric_hymns_bank_v1"), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (Array.isArray(data.hymns) && data.hymns.length > 0) {
          hymnsBankState.hymns = getSortedHymnsByPageEn(
            data.hymns.map((r, i) => normalizeHymnRecord(r, i))
          );
          localStorage.setItem("bishopric_hymns_bank_cache_v1", JSON.stringify(hymnsBankState));
          populateMusicDatalists();
          renderHymnsModal();
        }
      }
    });
  } catch (err) {
    console.warn("Firestore realtime listener warning:", err);
  }
}

async function persistMusicToFirestore(statusMessage = "✓ Saved & Synced to Bishopric Hub") {
  const topSt = document.getElementById("music-sync-status");
  const botSt = document.getElementById("music-bottom-save-status");
  if (topSt) topSt.textContent = "Saving & syncing...";
  if (botSt) botSt.textContent = "Saving & syncing to Bishopric Hub...";

  const cachePayload = {
    months: monthsMap,
    sundays: sundaysMap,
    maxActiveYear: customMaxSacYear,
    startTimes: sacramentStartTimesMap,
    accompanists: accompanistsList,
    choristers: choristersList
  };
  localStorage.setItem("bishopric_sacrament_cache_v1", JSON.stringify(cachePayload));

  try {
    const sacRef = doc(db, "home_content", "bishopric_sacrament_v1");
    const snap = await getDoc(sacRef);
    const existing = snap.exists() ? snap.data() : {};
    const mergedSundays = { ...(existing.sundays || {}), ...sundaysMap };
    // Ensure music fields from our local sundaysMap take precedence for every Sunday
    Object.keys(sundaysMap).forEach(dKey => {
      const localS = sundaysMap[dKey];
      const remoteS = existing.sundays?.[dKey] || {};
      mergedSundays[dKey] = {
        ...remoteS,
        ...localS,
        chorister: localS.chorister ?? remoteS.chorister ?? "",
        organist: localS.organist ?? remoteS.organist ?? "",
        openingHymn: localS.openingHymn ?? remoteS.openingHymn ?? "",
        sacramentHymn: localS.sacramentHymn ?? remoteS.sacramentHymn ?? "",
        intermediateType: localS.intermediateType ?? remoteS.intermediateType ?? "hymn",
        intermediateHymn: localS.intermediateHymn ?? remoteS.intermediateHymn ?? "",
        musicalNumber: localS.musicalNumber ?? remoteS.musicalNumber ?? "",
        closingHymn: localS.closingHymn ?? remoteS.closingHymn ?? ""
      };
    });

    await setDoc(sacRef, {
      ...existing,
      months: { ...(existing.months || {}), ...monthsMap },
      sundays: mergedSundays,
      maxActiveYear: Math.max(customMaxSacYear, Number(existing.maxActiveYear) || 2027),
      startTimes: { ...DEFAULT_SACRAMENT_START_TIMES, ...(existing.startTimes || {}), ...sacramentStartTimesMap },
      accompanists: accompanistsList,
      choristers: choristersList,
      updatedAt: new Date().toISOString(),
      updatedBy: currentMusicUser?.name || "Ward Music Coordinator"
    });

    if (topSt) topSt.textContent = statusMessage;
    if (botSt) botSt.textContent = statusMessage;
  } catch (err) {
    console.warn("Could not save Music Planner to Firestore:", err);
    notifyCloudSaveDenied(err); // v1.2.69
    if (topSt) topSt.textContent = "Saved locally (offline)";
    if (botSt) botSt.textContent = "Saved locally (will sync when online)";
  }
}

// ======================== RENDERING: WARD MUSIC PLANNER ========================
function renderMusicPlanner() {
  ensureAllAvailableSacramentYearsInitialized();

  const mKey = `${selectedYear}-${String(selectedMonth).padStart(2, "0")}`;
  const mMeta = monthsMap[mKey] || { monthKey: mKey, assignedConducting: "Duane Harris", theme: "" };
  const todayIso = getTodayIsoEastern();
  const currentMonthKey = todayIso.slice(0, 7);
  const readableMonth = `${MONTH_NAMES[selectedMonth - 1]} ${selectedYear}`;

  // 1. Year Eyebrow & Year Buttons
  const eyebrowEl = document.getElementById("music-year-eyebrow");
  if (eyebrowEl) {
    eyebrowEl.textContent = `${selectedYear} • Sacrament Meeting Music`;
  }
  const monthSectionTitleEl = document.getElementById("music-month-section-title"); // v1.2.84: year title
  if (monthSectionTitleEl) {
    monthSectionTitleEl.textContent = `${selectedYear} Monthly Music Selections`;
  }

  const availYears = getAvailableSacramentYears();
  const yearGroupEl = document.getElementById("music-year-btn-group");
  if (yearGroupEl) {
    yearGroupEl.innerHTML = availYears.map(yr => {
      const isAct = yr === selectedYear;
      return `<button type="button" data-music-year="${yr}"
        class="${
          isAct
            ? "px-3 py-1.5 rounded-lg text-xs font-bold bg-[#152548] text-white shadow-2xs transition cursor-pointer"
            : "px-3 py-1.5 rounded-lg text-xs font-bold text-[#536484] hover:text-[#152548] transition cursor-pointer"
        }">${yr}</button>`;
    }).join("");
  }

  // 2. Month Pills
  const monthPillsEl = document.getElementById("music-month-pills");
  if (monthPillsEl) {
    const startM = selectedYear === 2025 ? 10 : 1;
    let html = "";
    for (let m = startM; m <= 12; m++) {
      const isAct = m === selectedMonth;
      const iterKey = `${selectedYear}-${String(m).padStart(2, "0")}`;
      const isPast = iterKey < currentMonthKey;
      html += `
        <button type="button" data-music-month="${m}" role="tab" aria-selected="${isAct}"
          class="px-3.5 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
            isAct
              ? "bg-[#152548] text-white shadow-sm"
              : isPast
              ? "bg-slate-200 hover:bg-slate-300 text-slate-600 hover:text-[#152548] border border-slate-300"
              : "bg-[#FAF6EF] hover:bg-[#EFE6D5] text-[#536484] hover:text-[#152548] border border-[#E9DECE]"
          }">
          ${MONTH_SHORT[m - 1]}
        </button>
      `;
    }
    monthPillsEl.innerHTML = html;
  }

  // 3. Monthly Theme Banner (Requirement 2.b.i)
  const monthLabelEl = document.getElementById("music-selected-month-label");
  if (monthLabelEl) monthLabelEl.textContent = readableMonth;

  const startTimeBadgeEl = document.getElementById("music-start-time-badge");
  if (startTimeBadgeEl) {
    startTimeBadgeEl.textContent = `Sacrament Start Time: ${getSacramentStartTimeForYear(selectedYear)}`;
  }

  const themeDisplayEl = document.getElementById("music-monthly-theme-display");
  if (themeDisplayEl) {
    themeDisplayEl.textContent = mMeta.theme || "No theme set for this month";
  }

  const condDisplayEl = document.getElementById("music-monthly-conductor-display");
  if (condDisplayEl) {
    condDisplayEl.textContent = mMeta.assignedConducting || "Duane Harris";
  }

  const sundaysHeadingEl = document.getElementById("music-sundays-heading");
  if (sundaysHeadingEl) {
    sundaysHeadingEl.textContent = `SUNDAYS IN ${readableMonth.toUpperCase()}`;
  }

  // 4. Render Sunday Music Cards for the Selected Month (Requirement 2.b.ii)
  const monthSundays = Object.values(sundaysMap)
    .filter(s => s.date && s.date.startsWith(mKey))
    .sort((a, b) => a.date.localeCompare(b.date));

  // v1.2.88: Sunday folder tabs. Default to the next upcoming Sunday in this month, else the first; a month switch resets it.
  if (!monthSundays.some(s => s.date === selectedMusicSundayDate)) {
    const upcoming = monthSundays.find(s => s.date >= todayIso);
    selectedMusicSundayDate = (upcoming || monthSundays[0] || {}).date || null;
  }
  const sundayTabsEl = document.getElementById("music-sunday-tabs");
  if (sundayTabsEl) {
    sundayTabsEl.innerHTML = monthSundays.map((s, idx) => {
      const dStr = s.date;
      const isSel = dStr === selectedMusicSundayDate;
      const isPastSunday = dStr < todayIso;
      const mType = s.meetingType || "Standard";
      const isStandardType = mType === "Standard"; // v1.2.89: footer shows the meeting type
      const mTypeLabel = isStandardType ? "Standard Sunday" : mType;
      const tabClass = isSel
        ? "relative z-20 border-t-4 border-t-[#007B91] border-x-2 border-x-[#152548] border-b-0 bg-white rounded-t-2xl rounded-b-none pb-4"
        : isPastSunday
        ? "relative z-0 mb-[2px] border-2 border-b-0 border-slate-300 bg-slate-200/90 hover:bg-slate-300/80 text-slate-600 rounded-t-2xl rounded-b-none opacity-95 hover:opacity-100"
        : "relative z-0 mb-[2px] border-2 border-b-0 border-[#E9DECE] bg-[#FAF6EF] hover:bg-[#EFE6D5] hover:border-[#007B91] rounded-t-2xl rounded-b-none";
      const dim = isPastSunday && !isSel;
      return `
        <button type="button" role="tab" id="music-sunday-tab-${dStr}" aria-selected="${isSel}" aria-controls="music-sundays-container"
          data-music-select-sunday="${dStr}"
          class="flex-1 min-w-[9.5rem] text-left p-3.5 transition cursor-pointer flex flex-col justify-between gap-2 ${tabClass}">
          <div>
            <div class="flex items-center justify-between gap-1 mb-1">
              <span class="text-[10px] font-extrabold uppercase tracking-wider ${dim ? "text-slate-600" : "text-[#007B91]"}">
                ${idx + 1}${idx === 0 ? "st" : idx === 1 ? "nd" : idx === 2 ? "rd" : "th"} Sunday
              </span>
            </div>
            <div class="text-sm font-extrabold ${dim ? "text-slate-700" : "text-[#152548]"}">${escapeHtml(formatShortDate(dStr))}</div>
          </div>
          <div class="pt-2 border-t ${dim ? "border-slate-300" : "border-[#E9DECE]"} flex items-center justify-between gap-1 text-[11px]">
            <span class="font-bold ${dim ? "text-slate-600" : isStandardType ? "text-[#536484]" : "text-[#A74319]"} truncate">${escapeHtml(mTypeLabel)}</span>
            ${isSel ? `<span class="font-extrabold text-[#007B91] whitespace-nowrap">● Active Tab</span>` : ""}
          </div>
        </button>
      `;
    }).join("");
    // Narrow screens: keep the active tab scrolled into view inside the tab row (horizontal only; never scrolls the page)
    const activeTabEl = sundayTabsEl.querySelector('[aria-selected="true"]');
    if (activeTabEl && sundayTabsEl.scrollWidth > sundayTabsEl.clientWidth) {
      const tabLeft = activeTabEl.offsetLeft;
      const tabRight = tabLeft + activeTabEl.offsetWidth;
      if (tabLeft < sundayTabsEl.scrollLeft) sundayTabsEl.scrollLeft = tabLeft;
      else if (tabRight > sundayTabsEl.scrollLeft + sundayTabsEl.clientWidth) sundayTabsEl.scrollLeft = tabRight - sundayTabsEl.clientWidth;
    }
  }

  const containerEl = document.getElementById("music-sundays-container");
  if (!containerEl) return;

  // Do not clobber active typing inside a Sunday music input when a background snapshot arrives
  const activeEl = document.activeElement;
  if (activeEl && containerEl.contains(activeEl) && activeEl.tagName === "INPUT" && activeEl.type === "text") {
    return;
  }

  containerEl.innerHTML = monthSundays.map((s, idx) => {
    const dStr = s.date;
    const nthLabel = `${idx + 1}${idx === 0 ? "st" : idx === 1 ? "nd" : idx === 2 ? "rd" : "th"} Sunday`;
    const mType = s.meetingType || "Standard";
    const noWardSac = isNoWardSacramentMeetingType(mType);
    const isFastSunday = mType === "Fast Sunday";
    const isPastSunday = dStr < todayIso;
    const iType = s.intermediateType || "hymn";

    if (noWardSac) {
      return `
        <article class="bg-white border-2 border-red-200 bg-red-50/20 rounded-3xl p-5 sm:p-6 shadow-sm space-y-3" data-sunday-music-card="${dStr}">
          <!-- Card Header -->
          <div class="flex flex-wrap items-center justify-between gap-3 border-b border-[#E9DECE] pb-3.5">
            <div class="flex flex-wrap items-center gap-2.5">
              <span class="px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wider bg-[#152548] text-white">
                ${nthLabel}
              </span>
              <h4 class="text-lg sm:text-xl font-serif font-bold text-[#152548]">
                ${escapeHtml(formatReadableDate(dStr))}
              </h4>
              <span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300">
                ${escapeHtml(mType)}
              </span>
            </div>
          </div>

          <p class="text-sm sm:text-base font-bold text-red-700 py-1">
            No ward sacrament service on this Sunday
          </p>
        </article>
      `;
    }

    const formattedOpening = formatOrMatchHymnValue(s.openingHymn || "");
    const formattedSacrament = formatOrMatchHymnValue(s.sacramentHymn || "");
    const formattedIntermediate = formatOrMatchHymnValue(s.intermediateHymn || "");
    const formattedClosing = formatOrMatchHymnValue(s.closingHymn || "");

    return `
      <article class="bg-white border-2 ${
        isPastSunday
          ? "border-slate-300 bg-slate-50/70"
          : "border-[#E9DECE]"
      } rounded-3xl p-5 sm:p-6 shadow-sm space-y-4" data-sunday-music-card="${dStr}">
        <!-- Card Header -->
        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-[#E9DECE] pb-3.5">
          <div class="flex flex-wrap items-center gap-2.5">
            <span class="px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wider bg-[#152548] text-white">
              ${nthLabel}
            </span>
            <h4 class="text-lg sm:text-xl font-serif font-bold text-[#152548]">
              ${escapeHtml(formatReadableDate(dStr))}
            </h4>
            <span class="px-2.5 py-0.5 rounded-full text-xs font-bold ${
              isFastSunday
                ? "bg-[#A74319]/15 text-[#A74319]"
                : "bg-[#007B91]/15 text-[#007B91]"
            }">
              ${escapeHtml(mType)}
            </span>
          </div>

          <div class="flex items-center gap-2">
            <span id="music-card-status-${dStr}" class="text-[11px] font-bold text-emerald-700"></span>
          </div>
        </div>

        <!-- Row 1: Chorister & Accompanist -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <!-- Chorister -->
          <div class="form-field-group relative" data-music-dropdown-wrap="chor__${dStr}">
            <label for="music-chorister-${dStr}" class="text-xs font-bold text-[#152548]">
              Chorister
            </label>
            <div class="relative flex items-center">
              <input type="text" id="music-chorister-${dStr}" name="chorister_${dStr}"
                list="music-choristers-datalist" autocomplete="off"
                data-music-sunday="${dStr}" data-music-field="chorister"
                value="${escapeHtml(s.chorister || "")}"
                placeholder="Type or pull down chorister..."
                class="w-full pl-3.5 pr-9 py-2.5 rounded-xl border border-[#E9DECE] bg-white text-xs sm:text-sm font-semibold text-[#152548] focus:border-[#152548] outline-none">
              <button type="button" data-toggle-chorister-menu="${dStr}"
                aria-label="Pull down Choristers list for ${escapeHtml(formatShortDate(dStr))}"
                title="Pull down Choristers list"
                class="absolute right-1.5 w-7 h-7 rounded-lg hover:bg-[#EFE6D5] text-[#536484] hover:text-[#152548] flex items-center justify-center text-xs font-bold transition cursor-pointer">
                ▾
              </button>
            </div>
            <div id="music-dropdown-chor__${dStr}"
              class="music-custom-dropdown hidden absolute left-0 right-0 top-full mt-1 z-30 bg-white border border-[#E9DECE] rounded-xl shadow-xl max-h-56 overflow-y-auto divide-y divide-[#E9DECE]/60">
            </div>
          </div>

          <!-- Accompanist -->
          <div class="form-field-group relative" data-music-dropdown-wrap="acc__${dStr}">
            <label for="music-accompanist-${dStr}" class="text-xs font-bold text-[#152548]">
              Accompanist
            </label>
            <div class="relative flex items-center">
              <input type="text" id="music-accompanist-${dStr}" name="accompanist_${dStr}"
                list="music-accompanists-datalist" autocomplete="off"
                data-music-sunday="${dStr}" data-music-field="organist"
                value="${escapeHtml(s.organist || "")}"
                placeholder="Type or pull down accompanist..."
                class="w-full pl-3.5 pr-9 py-2.5 rounded-xl border border-[#E9DECE] bg-white text-xs sm:text-sm font-semibold text-[#152548] focus:border-[#152548] outline-none">
              <button type="button" data-toggle-accompanist-menu="${dStr}"
                aria-label="Pull down Accompanists list for ${escapeHtml(formatShortDate(dStr))}"
                title="Pull down Accompanists list"
                class="absolute right-1.5 w-7 h-7 rounded-lg hover:bg-[#EFE6D5] text-[#536484] hover:text-[#152548] flex items-center justify-center text-xs font-bold transition cursor-pointer">
                ▾
              </button>
            </div>
            <div id="music-dropdown-acc__${dStr}"
              class="music-custom-dropdown hidden absolute left-0 right-0 top-full mt-1 z-30 bg-white border border-[#E9DECE] rounded-xl shadow-xl max-h-56 overflow-y-auto divide-y divide-[#E9DECE]/60">
            </div>
          </div>
        </div>

        <!-- Row 2: Opening Hymn (Full-Width Expanded Line) -->
        <div class="form-field-group relative" data-music-dropdown-wrap="hymn__${dStr}__openingHymn">
          <label for="music-opening-hymn-${dStr}" class="text-xs font-bold text-[#152548]">
            Opening Hymn
          </label>
          <div class="relative flex items-center">
            <input type="text" id="music-opening-hymn-${dStr}" name="opening_hymn_${dStr}"
              list="music-hymns-datalist" autocomplete="off"
              data-music-sunday="${dStr}" data-music-field="openingHymn" data-is-hymn-input="true"
              value="${escapeHtml(formattedOpening)}"
              placeholder="Type or pull down hymn"
              class="w-full pl-3.5 pr-9 py-2.5 rounded-xl border border-[#E9DECE] bg-white text-xs sm:text-sm font-semibold text-[#152548] focus:border-[#152548] outline-none">
            <button type="button" data-toggle-hymn-menu="${dStr}__openingHymn"
              aria-label="Pull down Hymns list for Opening Hymn"
              title="Pull down Hymns list"
              class="absolute right-1.5 w-7 h-7 rounded-lg hover:bg-[#EFE6D5] text-[#536484] hover:text-[#152548] flex items-center justify-center text-xs font-bold transition cursor-pointer">
              ▾
            </button>
          </div>
          <div id="music-dropdown-hymn__${dStr}__openingHymn"
            class="music-custom-dropdown hidden absolute left-0 right-0 top-full mt-1 z-30 bg-white border border-[#E9DECE] rounded-xl shadow-xl max-h-60 overflow-y-auto divide-y divide-[#E9DECE]/60">
          </div>
        </div>

        <!-- Row 3: Sacrament Hymn (Moved Under Opening Hymn, Full-Width Expanded Line) -->
        <div class="form-field-group relative" data-music-dropdown-wrap="hymn__${dStr}__sacramentHymn">
          <label for="music-sacrament-hymn-${dStr}" class="text-xs font-bold text-[#152548]">
            Sacrament Hymn
          </label>
          <div class="relative flex items-center">
            <input type="text" id="music-sacrament-hymn-${dStr}" name="sacrament_hymn_${dStr}"
              list="music-hymns-datalist" autocomplete="off"
              data-music-sunday="${dStr}" data-music-field="sacramentHymn" data-is-hymn-input="true"
              value="${escapeHtml(formattedSacrament)}"
              placeholder="Type or pull down hymn"
              class="w-full pl-3.5 pr-9 py-2.5 rounded-xl border border-[#E9DECE] bg-white text-xs sm:text-sm font-semibold text-[#152548] focus:border-[#152548] outline-none">
            <button type="button" data-toggle-hymn-menu="${dStr}__sacramentHymn"
              aria-label="Pull down Hymns list for Sacrament Hymn"
              title="Pull down Hymns list"
              class="absolute right-1.5 w-7 h-7 rounded-lg hover:bg-[#EFE6D5] text-[#536484] hover:text-[#152548] flex items-center justify-center text-xs font-bold transition cursor-pointer">
              ▾
            </button>
          </div>
          <div id="music-dropdown-hymn__${dStr}__sacramentHymn"
            class="music-custom-dropdown hidden absolute left-0 right-0 top-full mt-1 z-30 bg-white border border-[#E9DECE] rounded-xl shadow-xl max-h-60 overflow-y-auto divide-y divide-[#E9DECE]/60">
          </div>
        </div>

        <!-- Row 4: Intermediate Hymn / Special Musical Number (Hidden on Fast Sunday) -->
        <div class="${isFastSunday ? "hidden" : ""} p-4 rounded-2xl bg-[#FAF6EF]/80 border border-[#E9DECE] space-y-3">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <span class="text-xs font-extrabold uppercase tracking-wider text-[#152548]">
              Intermediate Hymn / Special Musical Number
            </span>

            <fieldset class="inline-flex flex-wrap p-1 bg-white border border-[#E9DECE] rounded-xl gap-1">
              <legend class="sr-only">Intermediate Music Type for ${escapeHtml(formatShortDate(dStr))}</legend>
              <label class="cursor-pointer">
                <input type="radio" name="inter_type_${dStr}" value="hymn"
                  data-music-sunday="${dStr}" data-music-field="intermediateType"
                  ${iType === "hymn" ? "checked" : ""} class="sr-only peer">
                <span class="block px-3 py-1 rounded-lg text-xs font-bold text-[#536484] peer-checked:bg-[#152548] peer-checked:text-white transition">
                  Hymn
                </span>
              </label>
              <label class="cursor-pointer">
                <input type="radio" name="inter_type_${dStr}" value="musical_number"
                  data-music-sunday="${dStr}" data-music-field="intermediateType"
                  ${iType === "musical_number" ? "checked" : ""} class="sr-only peer">
                <span class="block px-3 py-1 rounded-lg text-xs font-bold text-[#536484] peer-checked:bg-[#152548] peer-checked:text-white transition">
                  Special Musical Number
                </span>
              </label>
              <label class="cursor-pointer">
                <input type="radio" name="inter_type_${dStr}" value="none"
                  data-music-sunday="${dStr}" data-music-field="intermediateType"
                  ${iType === "none" ? "checked" : ""} class="sr-only peer">
                <span class="block px-3 py-1 rounded-lg text-xs font-bold text-[#536484] peer-checked:bg-slate-600 peer-checked:text-white transition">
                  None
                </span>
              </label>
            </fieldset>
          </div>

          <!-- If Hymn: pull-down based on Hymn table -->
          <div id="music-inter-hymn-wrap-${dStr}" class="${iType === "hymn" ? "" : "hidden"} form-field-group relative"
            data-music-dropdown-wrap="hymn__${dStr}__intermediateHymn">
            <label for="music-intermediate-hymn-${dStr}" class="text-xs font-bold text-[#536484]">
              Intermediate Hymn
            </label>
            <div class="relative flex items-center">
              <input type="text" id="music-intermediate-hymn-${dStr}" name="intermediate_hymn_${dStr}"
                list="music-hymns-datalist" autocomplete="off"
                data-music-sunday="${dStr}" data-music-field="intermediateHymn" data-is-hymn-input="true"
                value="${escapeHtml(formattedIntermediate)}"
                placeholder="Type or pull down hymn"
                class="w-full pl-3.5 pr-9 py-2.5 rounded-xl border border-[#E9DECE] bg-white text-xs sm:text-sm font-semibold text-[#152548] focus:border-[#152548] outline-none">
              <button type="button" data-toggle-hymn-menu="${dStr}__intermediateHymn"
                aria-label="Pull down Hymns list for Intermediate Hymn"
                title="Pull down Hymns list"
                class="absolute right-1.5 w-7 h-7 rounded-lg hover:bg-[#EFE6D5] text-[#536484] hover:text-[#152548] flex items-center justify-center text-xs font-bold transition cursor-pointer">
                ▾
              </button>
            </div>
            <div id="music-dropdown-hymn__${dStr}__intermediateHymn"
              class="music-custom-dropdown hidden absolute left-0 right-0 top-full mt-1 z-30 bg-white border border-[#E9DECE] rounded-xl shadow-xl max-h-60 overflow-y-auto divide-y divide-[#E9DECE]/60">
            </div>
          </div>

          <!-- If Special Musical Number: text field -->
          <div id="music-inter-special-wrap-${dStr}" class="${iType === "musical_number" ? "" : "hidden"} form-field-group">
            <label for="music-special-number-${dStr}" class="text-xs font-bold text-[#536484]">
              Special Musical Number (Performers &amp; Selection)
            </label>
            <input type="text" id="music-special-number-${dStr}" name="musical_number_${dStr}"
              data-music-sunday="${dStr}" data-music-field="musicalNumber"
              value="${escapeHtml(s.musicalNumber || "")}"
              placeholder="Enter performers &amp; song title (e.g. Ward Choir — Come, Thou Fount)..."
              class="w-full px-3.5 py-2.5 rounded-xl border border-[#E9DECE] bg-white text-xs sm:text-sm font-semibold text-[#152548] focus:border-[#152548] outline-none">
          </div>

          <p id="music-inter-none-note-${dStr}" class="${iType === "none" ? "" : "hidden"} text-xs italic text-[#536484]">
            No intermediate music scheduled for this Sunday.
          </p>
        </div>

        <!-- Row 5: Closing Hymn (Moved After Intermediate Hymn, Full-Width Expanded Line) -->
        <div class="form-field-group relative" data-music-dropdown-wrap="hymn__${dStr}__closingHymn">
          <label for="music-closing-hymn-${dStr}" class="text-xs font-bold text-[#152548]">
            Closing Hymn
          </label>
          <div class="relative flex items-center">
            <input type="text" id="music-closing-hymn-${dStr}" name="closing_hymn_${dStr}"
              list="music-hymns-datalist" autocomplete="off"
              data-music-sunday="${dStr}" data-music-field="closingHymn" data-is-hymn-input="true"
              value="${escapeHtml(formattedClosing)}"
              placeholder="Type or pull down hymn"
              class="w-full pl-3.5 pr-9 py-2.5 rounded-xl border border-[#E9DECE] bg-white text-xs sm:text-sm font-semibold text-[#152548] focus:border-[#152548] outline-none">
            <button type="button" data-toggle-hymn-menu="${dStr}__closingHymn"
              aria-label="Pull down Hymns list for Closing Hymn"
              title="Pull down Hymns list"
              class="absolute right-1.5 w-7 h-7 rounded-lg hover:bg-[#EFE6D5] text-[#536484] hover:text-[#152548] flex items-center justify-center text-xs font-bold transition cursor-pointer">
              ▾
            </button>
          </div>
          <div id="music-dropdown-hymn__${dStr}__closingHymn"
            class="music-custom-dropdown hidden absolute left-0 right-0 top-full mt-1 z-30 bg-white border border-[#E9DECE] rounded-xl shadow-xl max-h-60 overflow-y-auto divide-y divide-[#E9DECE]/60">
          </div>
        </div>
      </article>
    `;
  }).join("");

  // v1.2.88: every Sunday card stays in the DOM (save-all reads them all); only the active Sunday's card is shown.
  containerEl.querySelectorAll("[data-sunday-music-card]").forEach(cardEl => {
    cardEl.classList.toggle("hidden", cardEl.getAttribute("data-sunday-music-card") !== selectedMusicSundayDate);
  });
  if (selectedMusicSundayDate) containerEl.setAttribute("aria-labelledby", `music-sunday-tab-${selectedMusicSundayDate}`);
}

// ======================== CUSTOM PULL-DOWN MENUS FOR HYMNS, CHORISTERS & ACCOMPANISTS ========================
function closeAllMusicDropdowns() {
  openDropdownKey = null;
  document.querySelectorAll(".music-custom-dropdown").forEach(el => {
    el.classList.add("hidden");
  });
}

function renderHymnMenuDropdown(dStr, fieldName, filterQuery = "") {
  const key = `hymn__${dStr}__${fieldName}`;
  const menuEl = document.getElementById(`music-dropdown-${key}`);
  if (!menuEl) return;

  const q = String(filterQuery || "").trim().toLowerCase();
  const sortedList = getSortedHymnsByPageEn(hymnsBankState.hymns || []);
  const filtered = q
    ? sortedList.filter(h => {
        const disp = formatHymnDisplay(h).toLowerCase();
        return (
          disp.includes(q) ||
          String(h.name_en || "").toLowerCase().includes(q) ||
          String(h.page_en || "").toLowerCase().includes(q) ||
          String(h.name_pt || "").toLowerCase().includes(q) ||
          String(h.page_pt || "").toLowerCase().includes(q)
        );
      })
    : sortedList;

  if (!filtered.length) {
    menuEl.innerHTML = `<div class="px-3.5 py-2.5 text-xs italic text-[#536484]">No matching hymn in Hymns table</div>`;
    return;
  }

  menuEl.innerHTML = filtered.map(h => {
    const displayVal = formatHymnDisplay(h);
    const ptSub = h.name_pt && h.name_pt !== "NA" ? `PT: ${h.name_pt} (p. ${h.page_pt})` : "Portuguese: NA";
    return `
      <button type="button"
        data-pick-music-hymn="${escapeHtml(displayVal)}"
        data-pick-sunday="${escapeHtml(dStr)}"
        data-pick-field="${escapeHtml(fieldName)}"
        class="w-full text-left px-3 py-2 hover:bg-[#FAF6EF] transition flex items-center justify-between gap-2 cursor-pointer">
        <div class="min-w-0">
          <div class="text-xs font-bold text-[#152548] truncate">${escapeHtml(displayVal)}</div>
          <div class="text-[10px] text-[#536484] truncate">${escapeHtml(ptSub)}</div>
        </div>
        <span class="shrink-0 px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-[#007B91]/15 text-[#007B91]">
          #${escapeHtml(String(h.page_en))}
        </span>
      </button>
    `;
  }).join("");
}

function renderChoristerMenuDropdown(dStr) {
  const menuEl = document.getElementById(`music-dropdown-chor__${dStr}`);
  if (!menuEl) return;
  const list = choristersList.length > 0 ? choristersList : (seedData?.choristers || []);
  if (!list.length) {
    menuEl.innerHTML = `<div class="px-3.5 py-2.5 text-xs italic text-[#536484]">No choristers in table</div>`;
    return;
  }
  menuEl.innerHTML = list.map(name => `
    <button type="button"
      data-pick-music-person="${escapeHtml(name)}"
      data-pick-sunday="${escapeHtml(dStr)}"
      data-pick-field="chorister"
      class="w-full text-left px-3.5 py-2 hover:bg-[#FAF6EF] text-xs font-bold text-[#152548] transition cursor-pointer">
      ${escapeHtml(name)}
    </button>
  `).join("");
}

function renderAccompanistMenuDropdown(dStr) {
  const menuEl = document.getElementById(`music-dropdown-acc__${dStr}`);
  if (!menuEl) return;
  const list = accompanistsList.length > 0 ? accompanistsList : (seedData?.organists || []);
  if (!list.length) {
    menuEl.innerHTML = `<div class="px-3.5 py-2.5 text-xs italic text-[#536484]">No accompanists in table</div>`;
    return;
  }
  menuEl.innerHTML = list.map(name => `
    <button type="button"
      data-pick-music-person="${escapeHtml(name)}"
      data-pick-sunday="${escapeHtml(dStr)}"
      data-pick-field="organist"
      class="w-full text-left px-3.5 py-2 hover:bg-[#FAF6EF] text-xs font-bold text-[#152548] transition cursor-pointer">
      ${escapeHtml(name)}
    </button>
  `).join("");
}

function collectMonthMusicFormIntoState() {
  const containerEl = document.getElementById("music-sundays-container");
  if (!containerEl) return;

  containerEl.querySelectorAll("[data-sunday-music-card]").forEach(cardEl => {
    const dStr = cardEl.getAttribute("data-sunday-music-card");
    if (!dStr || !sundaysMap[dStr]) return;
    const s = sundaysMap[dStr];

    const chorInp = document.getElementById(`music-chorister-${dStr}`);
    const accInp = document.getElementById(`music-accompanist-${dStr}`);
    const openInp = document.getElementById(`music-opening-hymn-${dStr}`);
    const sacInp = document.getElementById(`music-sacrament-hymn-${dStr}`);
    const closeInp = document.getElementById(`music-closing-hymn-${dStr}`);
    const interHymnInp = document.getElementById(`music-intermediate-hymn-${dStr}`);
    const specialInp = document.getElementById(`music-special-number-${dStr}`);
    const checkedType = cardEl.querySelector(`input[name="inter_type_${dStr}"]:checked`)?.value || s.intermediateType || "hymn";

    if (chorInp) s.chorister = chorInp.value.trim();
    if (accInp) s.organist = accInp.value.trim();
    if (openInp) s.openingHymn = formatOrMatchHymnValue(openInp.value.trim());
    if (sacInp) s.sacramentHymn = formatOrMatchHymnValue(sacInp.value.trim());
    if (closeInp) s.closingHymn = formatOrMatchHymnValue(closeInp.value.trim());
    s.intermediateType = checkedType;
    if (interHymnInp) s.intermediateHymn = formatOrMatchHymnValue(interHymnInp.value.trim());
    if (specialInp) s.musicalNumber = specialInp.value.trim();
  });
}

// ======================== REFERENCE MODALS (HYMNS, CHORISTERS, ACCOMPANISTS) ========================
function renderHymnsModal() {
  const tbody = document.getElementById("music-hymns-tbody");
  const countPill = document.getElementById("music-hymns-count-pill");
  if (!tbody) return;

  const allHymns = hymnsBankState.hymns || [];
  if (countPill) countPill.textContent = `${allHymns.length} Hymns`;

  const q = hymnsModalSearch.trim().toLowerCase();
  let list = allHymns.filter(h => {
    if (!q) return true;
    const hay = `${h.name_en} ${h.page_en} ${h.name_pt} ${h.page_pt} ${formatHymnDisplay(h)}`.toLowerCase();
    return hay.includes(q);
  });

  list.sort((a, b) => {
    if (hymnsModalSort === "name_en_asc") {
      return String(a.name_en || "").localeCompare(String(b.name_en || ""), undefined, { sensitivity: "base" });
    }
    if (hymnsModalSort === "page_pt_asc") {
      const pA = getHymnPageNumeric(a.page_pt);
      const pB = getHymnPageNumeric(b.page_pt);
      if (pA !== pB) return pA - pB;
      return getHymnPageNumeric(a.page_en) - getHymnPageNumeric(b.page_en);
    }
    if (hymnsModalSort === "name_pt_asc") {
      const nA = a.name_pt === "NA" ? "zzzz" : String(a.name_pt || "");
      const nB = b.name_pt === "NA" ? "zzzz" : String(b.name_pt || "");
      const cmp = nA.localeCompare(nB, undefined, { sensitivity: "base" });
      if (cmp !== 0) return cmp;
      return getHymnPageNumeric(a.page_en) - getHymnPageNumeric(b.page_en);
    }
    const pA = getHymnPageNumeric(a.page_en);
    const pB = getHymnPageNumeric(b.page_en);
    if (pA !== pB) return pA - pB;
    return String(a.name_en || "").localeCompare(String(b.name_en || ""), undefined, { sensitivity: "base" });
  });

  tbody.innerHTML = list.map(h => `
    <tr class="hover:bg-[#FAF6EF]/60 transition">
      <td class="py-2.5 px-3.5 font-bold text-[#152548]">${escapeHtml(h.name_en)}</td>
      <td class="py-2.5 px-2.5 text-center font-extrabold text-[#007B91]">${escapeHtml(h.page_en)}</td>
      <td class="py-2.5 px-3.5 font-medium ${h.name_pt === "NA" ? "text-slate-400 italic" : "text-[#152548]"}">${escapeHtml(h.name_pt)}</td>
      <td class="py-2.5 px-2.5 text-center font-bold ${h.page_pt === "NA" ? "text-slate-400 italic" : "text-[#A74319]"}">${escapeHtml(h.page_pt)}</td>
    </tr>
  `).join("");
}

function renderChoristersModal() {
  const tbody = document.getElementById("music-choristers-tbody");
  const countPill = document.getElementById("music-choristers-count-pill");
  if (!tbody) return;

  if (choristersList.length === 0 && Array.isArray(seedData?.choristers) && seedData.choristers.length > 0) {
    choristersList = [...seedData.choristers];
  }
  if (countPill) countPill.textContent = `${choristersList.length}`;

  if (!choristersList.length) {
    tbody.innerHTML = `<tr><td colspan="2" class="py-6 px-4 text-center text-xs italic text-[#536484]">No choristers added yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = choristersList.map((name, idx) => {
    if (editingChoristerIdx === idx) {
      return `
        <tr class="bg-[#FAF6EF]">
          <td class="py-2.5 px-4">
            <label class="sr-only" for="music-chor-edit-${idx}">Chorister Name</label>
            <input type="text" id="music-chor-edit-${idx}" value="${escapeHtml(name)}"
              class="w-full px-3 py-1.5 rounded-lg border border-[#152548] bg-white text-xs font-bold text-[#152548]">
          </td>
          <td class="py-2.5 px-4 text-right whitespace-nowrap space-x-1">
            <button type="button" data-music-chor-save="${idx}"
              class="px-2.5 py-1 rounded-lg bg-emerald-700 text-white text-[11px] font-bold cursor-pointer">Save</button>
            <button type="button" data-music-chor-cancel="${idx}"
              class="px-2 py-1 rounded-lg bg-slate-200 text-slate-700 text-[11px] font-bold cursor-pointer">Cancel</button>
          </td>
        </tr>
      `;
    }
    return `
      <tr class="hover:bg-[#FAF6EF]/60 transition">
        <td class="py-3 px-4 font-bold text-[#152548]">${escapeHtml(name)}</td>
        <td class="py-3 px-4 text-right whitespace-nowrap space-x-1">
          <button type="button" data-music-chor-edit="${idx}"
            class="px-2.5 py-1 rounded-lg bg-[#FAF6EF] hover:bg-[#EFE6D5] border border-[#E9DECE] text-[#152548] text-[11px] font-bold cursor-pointer">Modify</button>
          <button type="button" data-music-chor-del="${idx}"
            class="px-2.5 py-1 rounded-lg bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 text-[11px] font-bold cursor-pointer">Delete</button>
        </td>
      </tr>
    `;
  }).join("");
}

function renderAccompanistsModal() {
  const tbody = document.getElementById("music-accompanists-tbody");
  const countPill = document.getElementById("music-accompanists-count-pill");
  if (!tbody) return;

  if (accompanistsList.length === 0 && Array.isArray(seedData?.organists) && seedData.organists.length > 0) {
    accompanistsList = [...seedData.organists];
  }
  if (countPill) countPill.textContent = `${accompanistsList.length}`;

  if (!accompanistsList.length) {
    tbody.innerHTML = `<tr><td colspan="2" class="py-6 px-4 text-center text-xs italic text-[#536484]">No accompanists added yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = accompanistsList.map((name, idx) => {
    if (editingAccompanistIdx === idx) {
      return `
        <tr class="bg-[#FAF6EF]">
          <td class="py-2.5 px-4">
            <label class="sr-only" for="music-acc-edit-${idx}">Accompanist Name</label>
            <input type="text" id="music-acc-edit-${idx}" value="${escapeHtml(name)}"
              class="w-full px-3 py-1.5 rounded-lg border border-[#152548] bg-white text-xs font-bold text-[#152548]">
          </td>
          <td class="py-2.5 px-4 text-right whitespace-nowrap space-x-1">
            <button type="button" data-music-acc-save="${idx}"
              class="px-2.5 py-1 rounded-lg bg-emerald-700 text-white text-[11px] font-bold cursor-pointer">Save</button>
            <button type="button" data-music-acc-cancel="${idx}"
              class="px-2 py-1 rounded-lg bg-slate-200 text-slate-700 text-[11px] font-bold cursor-pointer">Cancel</button>
          </td>
        </tr>
      `;
    }
    return `
      <tr class="hover:bg-[#FAF6EF]/60 transition">
        <td class="py-3 px-4 font-bold text-[#152548]">${escapeHtml(name)}</td>
        <td class="py-3 px-4 text-right whitespace-nowrap space-x-1">
          <button type="button" data-music-acc-edit="${idx}"
            class="px-2.5 py-1 rounded-lg bg-[#FAF6EF] hover:bg-[#EFE6D5] border border-[#E9DECE] text-[#152548] text-[11px] font-bold cursor-pointer">Modify</button>
          <button type="button" data-music-acc-del="${idx}"
            class="px-2.5 py-1 rounded-lg bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 text-[11px] font-bold cursor-pointer">Delete</button>
        </td>
      </tr>
    `;
  }).join("");
}

// ======================== EVENT LISTENERS ========================
function initMusicPlannerInteractions() {
  document.addEventListener("click", (e) => {
    if (!e.target.closest("[data-music-dropdown-wrap]")) {
      closeAllMusicDropdowns();
    }

    // Year selection
    const yrBtn = e.target.closest("[data-music-year]");
    if (yrBtn) {
      collectMonthMusicFormIntoState();
      selectedYear = Number(yrBtn.getAttribute("data-music-year"));
      if (selectedYear === 2025 && selectedMonth < 10) selectedMonth = 10;
      renderMusicPlanner();
      return;
    }

    // Month selection
    const moBtn = e.target.closest("[data-music-month]");
    if (moBtn) {
      collectMonthMusicFormIntoState();
      selectedMonth = Number(moBtn.getAttribute("data-music-month"));
      renderMusicPlanner();
      return;
    }

    // Toggle Hymn dropdown menu
    const toggleHymnBtn = e.target.closest("[data-toggle-hymn-menu]");
    if (toggleHymnBtn) {
      const rawTarget = toggleHymnBtn.getAttribute("data-toggle-hymn-menu") || "";
      const [dStr, fieldName] = rawTarget.split("__");
      const key = `hymn__${dStr}__${fieldName}`;
      const menuEl = document.getElementById(`music-dropdown-${key}`);
      if (dStr && fieldName && menuEl) {
        const willOpen = openDropdownKey !== key || menuEl.classList.contains("hidden");
        closeAllMusicDropdowns();
        if (willOpen) {
          openDropdownKey = key;
          renderHymnMenuDropdown(dStr, fieldName, "");
          menuEl.classList.remove("hidden");
        }
      }
      return;
    }

    // Pick Hymn from dropdown menu
    const pickHymnBtn = e.target.closest("[data-pick-music-hymn]");
    if (pickHymnBtn) {
      const chosenVal = pickHymnBtn.getAttribute("data-pick-music-hymn") || "";
      const dStr = pickHymnBtn.getAttribute("data-pick-sunday") || "";
      const fieldName = pickHymnBtn.getAttribute("data-pick-field") || "";
      const fieldIdMap = {
        openingHymn: `music-opening-hymn-${dStr}`,
        sacramentHymn: `music-sacrament-hymn-${dStr}`,
        intermediateHymn: `music-intermediate-hymn-${dStr}`,
        closingHymn: `music-closing-hymn-${dStr}`
      };
      const inp = document.getElementById(fieldIdMap[fieldName] || "");
      if (inp) {
        inp.value = chosenVal;
        closeAllMusicDropdowns();
        collectMonthMusicFormIntoState();
        persistMusicToFirestore(`✓ Saved ${formatShortDate(dStr)} hymn to Bishopric Hub`);
      }
      return;
    }

    // Toggle Chorister dropdown menu
    const toggleChorBtn = e.target.closest("[data-toggle-chorister-menu]");
    if (toggleChorBtn) {
      const dStr = toggleChorBtn.getAttribute("data-toggle-chorister-menu") || "";
      const key = `chor__${dStr}`;
      const menuEl = document.getElementById(`music-dropdown-${key}`);
      if (dStr && menuEl) {
        const willOpen = openDropdownKey !== key || menuEl.classList.contains("hidden");
        closeAllMusicDropdowns();
        if (willOpen) {
          openDropdownKey = key;
          renderChoristerMenuDropdown(dStr);
          menuEl.classList.remove("hidden");
        }
      }
      return;
    }

    // Toggle Accompanist dropdown menu
    const toggleAccBtn = e.target.closest("[data-toggle-accompanist-menu]");
    if (toggleAccBtn) {
      const dStr = toggleAccBtn.getAttribute("data-toggle-accompanist-menu") || "";
      const key = `acc__${dStr}`;
      const menuEl = document.getElementById(`music-dropdown-${key}`);
      if (dStr && menuEl) {
        const willOpen = openDropdownKey !== key || menuEl.classList.contains("hidden");
        closeAllMusicDropdowns();
        if (willOpen) {
          openDropdownKey = key;
          renderAccompanistMenuDropdown(dStr);
          menuEl.classList.remove("hidden");
        }
      }
      return;
    }

    // Pick Chorister or Accompanist from dropdown menu
    const pickPersonBtn = e.target.closest("[data-pick-music-person]");
    if (pickPersonBtn) {
      const chosenName = pickPersonBtn.getAttribute("data-pick-music-person") || "";
      const dStr = pickPersonBtn.getAttribute("data-pick-sunday") || "";
      const fieldName = pickPersonBtn.getAttribute("data-pick-field") || "";
      const inpId = fieldName === "chorister" ? `music-chorister-${dStr}` : `music-accompanist-${dStr}`;
      const inp = document.getElementById(inpId);
      if (inp) {
        inp.value = chosenName;
        closeAllMusicDropdowns();
        collectMonthMusicFormIntoState();
        persistMusicToFirestore(`✓ Saved ${formatShortDate(dStr)} ${fieldName === "chorister" ? "chorister" : "accompanist"} to Bishopric Hub`);
      }
      return;
    }

    // v1.2.88: Sunday folder tab selection
    const sunTabBtn = e.target.closest("[data-music-select-sunday]");
    if (sunTabBtn) {
      if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
      collectMonthMusicFormIntoState();
      selectedMusicSundayDate = sunTabBtn.getAttribute("data-music-select-sunday") || selectedMusicSundayDate;
      renderMusicPlanner();
      return;
    }

    // Save Single Sunday Music Button
    const saveSunBtn = e.target.closest("[data-save-sunday-music]");
    if (saveSunBtn) {
      const dStr = saveSunBtn.getAttribute("data-save-sunday-music") || "";
      collectMonthMusicFormIntoState();
      renderMusicPlanner();
      const cardSt = document.getElementById(`music-card-status-${dStr}`);
      if (cardSt) {
        cardSt.textContent = "✓ Synced to Bishopric Hub";
        setTimeout(() => {
          if (cardSt.textContent === "✓ Synced to Bishopric Hub") cardSt.textContent = "";
        }, 3000);
      }
      persistMusicToFirestore(`✓ Saved ${formatShortDate(dStr)} music & synced to Bishopric Hub`);
      return;
    }

    // Choristers Modal Actions
    const chorEdit = e.target.closest("[data-music-chor-edit]");
    if (chorEdit) {
      editingChoristerIdx = Number(chorEdit.getAttribute("data-music-chor-edit"));
      renderChoristersModal();
      return;
    }
    const chorCancel = e.target.closest("[data-music-chor-cancel]");
    if (chorCancel) {
      editingChoristerIdx = null;
      renderChoristersModal();
      return;
    }
    const chorSave = e.target.closest("[data-music-chor-save]");
    if (chorSave) {
      const idx = Number(chorSave.getAttribute("data-music-chor-save"));
      const val = (document.getElementById(`music-chor-edit-${idx}`)?.value || "").trim();
      if (val && idx >= 0 && idx < choristersList.length) {
        choristersList[idx] = val;
        editingChoristerIdx = null;
        populateMusicDatalists();
        renderChoristersModal();
        persistMusicToFirestore(`✓ Updated chorister ${val}`);
      }
      return;
    }
    const chorDel = e.target.closest("[data-music-chor-del]");
    if (chorDel) {
      const idx = Number(chorDel.getAttribute("data-music-chor-del"));
      if (idx >= 0 && idx < choristersList.length) {
        choristersList.splice(idx, 1);
        editingChoristerIdx = null;
        populateMusicDatalists();
        renderChoristersModal();
        persistMusicToFirestore("✓ Updated Choristers table");
      }
      return;
    }

    // Accompanists Modal Actions
    const accEdit = e.target.closest("[data-music-acc-edit]");
    if (accEdit) {
      editingAccompanistIdx = Number(accEdit.getAttribute("data-music-acc-edit"));
      renderAccompanistsModal();
      return;
    }
    const accCancel = e.target.closest("[data-music-acc-cancel]");
    if (accCancel) {
      editingAccompanistIdx = null;
      renderAccompanistsModal();
      return;
    }
    const accSave = e.target.closest("[data-music-acc-save]");
    if (accSave) {
      const idx = Number(accSave.getAttribute("data-music-acc-save"));
      const val = (document.getElementById(`music-acc-edit-${idx}`)?.value || "").trim();
      if (val && idx >= 0 && idx < accompanistsList.length) {
        accompanistsList[idx] = val;
        editingAccompanistIdx = null;
        populateMusicDatalists();
        renderAccompanistsModal();
        persistMusicToFirestore(`✓ Updated accompanist ${val}`);
      }
      return;
    }
    const accDel = e.target.closest("[data-music-acc-del]");
    if (accDel) {
      const idx = Number(accDel.getAttribute("data-music-acc-del"));
      if (idx >= 0 && idx < accompanistsList.length) {
        accompanistsList.splice(idx, 1);
        editingAccompanistIdx = null;
        populateMusicDatalists();
        renderAccompanistsModal();
        persistMusicToFirestore("✓ Updated Accompanists table");
      }
      return;
    }
  });

  // Form changes & auto-save
  const monthForm = document.getElementById("music-month-form");
  if (monthForm) {
    monthForm.addEventListener("submit", (e) => {
      e.preventDefault();
      collectMonthMusicFormIntoState();
      renderMusicPlanner();
      persistMusicToFirestore(`✓ Saved all ${MONTH_NAMES[selectedMonth - 1]} ${selectedYear} music to Bishopric Hub`);
    });

    monthForm.addEventListener("change", (e) => {
      const dStr = e.target.getAttribute("data-music-sunday");
      const field = e.target.getAttribute("data-music-field");
      if (dStr && field === "intermediateType") {
        const iType = e.target.value;
        document.getElementById(`music-inter-hymn-wrap-${dStr}`)?.classList.toggle("hidden", iType !== "hymn");
        document.getElementById(`music-inter-special-wrap-${dStr}`)?.classList.toggle("hidden", iType !== "musical_number");
        document.getElementById(`music-inter-none-note-${dStr}`)?.classList.toggle("hidden", iType !== "none");
      }
      if (e.target.getAttribute("data-is-hymn-input") === "true") {
        e.target.value = formatOrMatchHymnValue(e.target.value);
      }
      collectMonthMusicFormIntoState();
      clearTimeout(saveDebounceTimer);
      saveDebounceTimer = setTimeout(() => persistMusicToFirestore(), 500);
    });

    monthForm.addEventListener("input", (e) => {
      const dStr = e.target.getAttribute("data-music-sunday");
      const field = e.target.getAttribute("data-music-field");
      if (dStr && field && e.target.getAttribute("data-is-hymn-input") === "true") {
        const key = `hymn__${dStr}__${field}`;
        if (openDropdownKey === key) {
          renderHymnMenuDropdown(dStr, field, e.target.value || "");
        }
      }
      collectMonthMusicFormIntoState();
      clearTimeout(saveDebounceTimer);
      saveDebounceTimer = setTimeout(() => persistMusicToFirestore(), 700);
    });
  }

  document.getElementById("btn-music-save-all-top")?.addEventListener("click", () => {
    collectMonthMusicFormIntoState();
    renderMusicPlanner();
    persistMusicToFirestore(`✓ Saved all ${MONTH_NAMES[selectedMonth - 1]} ${selectedYear} music to Bishopric Hub`);
  });

  // Modals: Hymns, Choristers, Accompanists
  document.getElementById("btn-music-open-hymns")?.addEventListener("click", () => {
    renderHymnsModal();
    document.getElementById("music-hymns-dialog")?.showModal();
  });
  document.getElementById("btn-close-music-hymns")?.addEventListener("click", () => {
    document.getElementById("music-hymns-dialog")?.close();
  });
  document.getElementById("music-hymns-search")?.addEventListener("input", (e) => {
    hymnsModalSearch = e.target.value || "";
    renderHymnsModal();
  });
  document.getElementById("music-hymns-sort")?.addEventListener("change", (e) => {
    hymnsModalSort = e.target.value || "page_en_asc";
    renderHymnsModal();
  });

  document.getElementById("btn-music-open-choristers")?.addEventListener("click", () => {
    editingChoristerIdx = null;
    renderChoristersModal();
    document.getElementById("music-choristers-dialog")?.showModal();
  });
  document.getElementById("btn-close-music-choristers")?.addEventListener("click", () => {
    document.getElementById("music-choristers-dialog")?.close();
  });
  document.getElementById("btn-music-choristers-toggle-add")?.addEventListener("click", () => {
    const f = document.getElementById("music-choristers-add-form");
    if (f) {
      f.classList.toggle("hidden");
      if (!f.classList.contains("hidden")) document.getElementById("music-chorister-add-name")?.focus();
    }
  });
  document.getElementById("btn-music-choristers-cancel-add")?.addEventListener("click", () => {
    document.getElementById("music-choristers-add-form")?.classList.add("hidden");
  });
  document.getElementById("music-choristers-add-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const raw = (document.getElementById("music-chorister-add-name")?.value || "").trim();
    if (!raw) return;
    choristersList.push(raw);
    e.target.reset();
    document.getElementById("music-choristers-add-form")?.classList.add("hidden");
    populateMusicDatalists();
    renderChoristersModal();
    persistMusicToFirestore(`✓ Added chorister ${raw}`);
  });

  document.getElementById("btn-music-open-accompanists")?.addEventListener("click", () => {
    editingAccompanistIdx = null;
    renderAccompanistsModal();
    document.getElementById("music-accompanists-dialog")?.showModal();
  });
  document.getElementById("btn-close-music-accompanists")?.addEventListener("click", () => {
    document.getElementById("music-accompanists-dialog")?.close();
  });
  document.getElementById("btn-music-accompanists-toggle-add")?.addEventListener("click", () => {
    const f = document.getElementById("music-accompanists-add-form");
    if (f) {
      f.classList.toggle("hidden");
      if (!f.classList.contains("hidden")) document.getElementById("music-accompanist-add-name")?.focus();
    }
  });
  document.getElementById("btn-music-accompanists-cancel-add")?.addEventListener("click", () => {
    document.getElementById("music-accompanists-add-form")?.classList.add("hidden");
  });
  document.getElementById("music-accompanists-add-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const raw = (document.getElementById("music-accompanist-add-name")?.value || "").trim();
    if (!raw) return;
    accompanistsList.push(raw);
    e.target.reset();
    document.getElementById("music-accompanists-add-form")?.classList.add("hidden");
    populateMusicDatalists();
    renderAccompanistsModal();
    persistMusicToFirestore(`✓ Added accompanist ${raw}`);
  });
}

// ======================== BOOTSTRAP ========================
document.addEventListener("DOMContentLoaded", async () => {
  initSeasonalParallax();
  await loadWardLeadersPool();
  initMusicLoginGate();
  initMusicPlannerInteractions();
  await loadDataAndSyncFirestore();
});


// 2026-11-20: Bishopric Hub-style folder tabs drive the existing auth-mode radios (wiring only).
(() => {
  const tabBtns = Array.from(document.querySelectorAll("[data-music-auth-tab]:not([hidden])")); // hidden Password tab is skipped
  const radios = Array.from(document.querySelectorAll('input[name="music_gate_auth_mode"]'));
  if (!tabBtns.length || !radios.length) return;
  const syncTabs = () => {
    const mode = (radios.find(r => r.checked) || {}).value || "sms";
    tabBtns.forEach(btn => {
      const active = btn.dataset.musicAuthTab === mode;
      btn.classList.toggle("active-tab", active);
      btn.setAttribute("aria-selected", active ? "true" : "false");
      btn.tabIndex = active ? 0 : -1;
    });
  };
  const selectTab = (mode) => {
    const radio = radios.find(r => r.value === mode);
    if (radio && !radio.checked) {
      radio.checked = true;
      radio.dispatchEvent(new Event("change", { bubbles: true }));
    }
    syncTabs();
  };
  tabBtns.forEach((btn, idx) => {
    btn.addEventListener("click", () => selectTab(btn.dataset.musicAuthTab));
    btn.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        const nextBtn = tabBtns[(idx + 1) % tabBtns.length];
        nextBtn.focus();
        selectTab(nextBtn.dataset.musicAuthTab);
      }
    });
  });
  radios.forEach(r => r.addEventListener("change", syncTabs));
  syncTabs();
})();
