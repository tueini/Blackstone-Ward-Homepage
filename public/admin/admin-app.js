import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
  getFirestore,
  collection,
  getDocs,
  setDoc,
  doc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import {
  getAuth,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

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

function formatTimeTo24(timeStr) {
  if (!timeStr) return "00:00:00";
  const trimmed = timeStr.trim().toLowerCase();
  const match = trimmed.match(/^(\d{1,2}):(\d{2})(?:\s*(am|pm))?$/);
  if (!match) return "00:00:00";
  let [, h, m, meridiem] = match;
  let hour = parseInt(h, 10);
  if (meridiem === 'pm' && hour < 12) hour += 12;
  if (meridiem === 'am' && hour === 12) hour = 0;
  return `${String(hour).padStart(2, '0')}:${m}:00`;
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
  admin: { label: "Ward Administrator", org: "All Ward", fullAccess: true },
  bishopric: { label: "Bishopric", org: "All Ward", fullAccess: true },
  relief_society: { label: "Relief Society", org: "Relief Society", fullAccess: false },
  elders_quorum: { label: "Elders Quorum", org: "Elders Quorum", fullAccess: false },
  primary: { label: "Primary", org: "Primary", fullAccess: false },
  sunday_school: { label: "Sunday School", org: "Sunday School", fullAccess: false },
  mission: { label: "Ward Mission", org: "Mission", fullAccess: false }
};

// ================= RBAC PERMISSIONS =================
function canUserChangePassword(targetLeader) {
  if (!targetLeader) return false;
  const currentRole = currentLeaderProfile?.role || 'admin';
  const targetRole = targetLeader?.role || 'relief_society';

  // 1. Ward Administrator can change all passwords
  if (currentRole === 'admin') return true;

  // 2. Bishopric can change Bishopric and all other users, but NOT Ward Administrator
  if (currentRole === 'bishopric') {
    return targetRole !== 'admin';
  }

  // 3. Other org users can only change passwords in their own org
  if (targetRole === 'admin' || targetRole === 'bishopric') return false;
  const currentOrg = ROLE_DEFINITIONS[currentRole]?.org;
  const targetOrg = ROLE_DEFINITIONS[targetRole]?.org;
  return !!(currentOrg && targetOrg && currentOrg === targetOrg && currentOrg !== 'All Ward');
}

function canUserEditLeader(targetLeader) {
  if (!targetLeader) return false;
  const currentRole = currentLeaderProfile?.role || 'admin';
  const targetRole = targetLeader?.role || 'relief_society';

  // 1. Ward Administrator can edit all leaders
  if (currentRole === 'admin') return true;

  // 2. Bishopric can add/edit all other users and Bishopric, but NOT Ward Administrator
  if (currentRole === 'bishopric') {
    return targetRole !== 'admin';
  }

  // 3. Other org users cannot edit leader profiles
  return false;
}

function canUserDeleteLeader(targetLeader) {
  if (!targetLeader) return false;
  const currentRole = currentLeaderProfile?.role || 'admin';
  const targetRole = targetLeader?.role || 'relief_society';

  // 1. Ward Administrator can delete leaders (except primary admin Duane Harris)
  if (currentRole === 'admin') {
    return targetLeader.id !== 'leader_duane_harris' && targetLeader.phoneNumber !== '+15084940905';
  }

  // 2. Bishopric can remove other leaders and Bishopric, but NOT Ward Administrator
  if (currentRole === 'bishopric') {
    return targetRole !== 'admin';
  }

  // 3. Other org users cannot remove leaders
  return false;
}

function canUserAddLeader() {
  const currentRole = currentLeaderProfile?.role || 'admin';
  return currentRole === 'admin' || currentRole === 'bishopric';
}

function canUserOnboardLeader(targetLeader) {
  if (!targetLeader) return false;
  const currentRole = currentLeaderProfile?.role || 'admin';
  const targetRole = targetLeader?.role || 'relief_society';

  // 1. Ward Administrator can onboard all leaders
  if (currentRole === 'admin') return true;

  // 2. Bishopric can onboard Bishopric and all other users, but NOT Ward Administrator
  if (currentRole === 'bishopric') {
    return targetRole !== 'admin';
  }

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
  try {
    const ssoPayload = { ...profile };
    delete ssoPayload.passwordHash; // Protect credentials from cookie storage
    if (!ssoPayload.authenticatedAt) {
      ssoPayload.authenticatedAt = new Date().toISOString();
    }
    const val = encodeURIComponent(JSON.stringify(ssoPayload));
    const domain = getSSOCookieDomain();
    const domainAttr = (domain === 'localhost' || domain === '127.0.0.1') ? '' : `; domain=${domain}`;
    const secureAttr = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `ward_auth_session=${val}; path=/; max-age=604800; SameSite=Lax${domainAttr}${secureAttr}`;
  } catch (err) {
    console.warn("SSO cookie set error:", err);
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
const AUTHORIZED_MASTER_HASHES = [
  "103a9f4c69d7331576e1a7b7f96ce781e3336f7b304424373aea1f263c581a3d", // yutehub!1830 (Youth Hub master)
  "7ca8ae40ffb835bcc16f1de3fc4f27e3e6b3c709bc5d300f932cd019f86e488b", // YuteHub!1830 (exact)
  "4b465598d5fd124a3856acff035f025315f798faf08049ee57409e3045c72e37", // YuteHub!830 (exact)
  "7f39e9e47d673293ede2907b955e989ab9188e35c39684c95eff536bb5b3e542"  // yutehub!830 (lower)
];

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
    err.textContent = "Please type both your first and last name (e.g. Duane Harris).";
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
  const pool = [...leadersCache];
  if (!pool.some(l => l.displayName === 'Duane Harris')) {
    pool.unshift({
      displayName: "Duane Harris",
      phoneNumber: "+15084940905",
      role: "admin",
      active: true
    });
  }

  const cleanName = enteredName.toLowerCase();
  const leaderMatch = pool.find(l => (l.displayName || '').toLowerCase() === cleanName) ||
    pool.find(l => (l.displayName || '').toLowerCase().includes(cleanName));

  if (!leaderMatch) {
    err.textContent = `Leader "${enteredName}" was not found among authorized ward leaders. Please verify your first and last name.`;
    err.classList.remove('hidden');
    nameInput?.focus();
    return;
  }

  if (leaderMatch.phoneNumber) {
    const regPhone = normalizePhone(leaderMatch.phoneNumber);
    if (regPhone && regPhone !== phone) {
      err.textContent = `The phone number entered does not match the registered phone on file for ${leaderMatch.displayName}. Please verify your phone number.`;
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
    const leadersSnap = await getDocs(collection(db, "ward_leaders"));

    // Auto-bootstrap: If collection is completely empty, register Duane Harris as Ward Admin
    if (leadersSnap.empty) {
      const initialAdmin = {
        displayName: "Duane Harris",
        email: "tueini@gmail.com",
        phoneNumber: phone,
        role: "admin",
        active: true,
        createdAt: new Date().toISOString()
      };
      await setDoc(doc(db, "ward_leaders", "leader_duane_harris"), initialAdmin);
      sessionStorage.setItem('wardLeaderProfile', JSON.stringify(initialAdmin));
      sessionStorage.setItem('wardAdminAuth', 'true');
      setSSOCookie(initialAdmin);
      checkAuth();
      return;
    }

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

    if (matchedLeader) {
      sessionStorage.setItem('wardLeaderProfile', JSON.stringify(matchedLeader));
      sessionStorage.setItem('wardAdminAuth', 'true');
      setSSOCookie(matchedLeader);
      checkAuth();
    } else {
      err.textContent = `Phone ${phone} verified, but not found in registered ward leaders. Please contact an administrator.`;
      err.classList.remove('hidden');
      await signOut(auth);
    }
  } catch (errCatch) {
    console.error("Code verification error:", errCatch);
    err.textContent = "Incorrect or expired verification code. Please try again.";
    err.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.textContent = "Verify & Enter Portal";
  }
}

// ================= PASSKEY (WEBAUTHN) =================
let passkeyAutofillAbortController = null;

async function initPasskeyAutofill() {
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

    const challenge = new Uint8Array(32);
    crypto.getRandomValues(challenge);

    const assertion = await navigator.credentials.get({
      mediation: 'conditional',
      signal: passkeyAutofillAbortController.signal,
      publicKey: {
        challenge: challenge,
        timeout: 60000,
        userVerification: "preferred"
      }
    });

    if (assertion) {
      let profile = null;
      const saved = localStorage.getItem('wardPasskeyRegistered');
      if (saved) {
        try {
          const data = JSON.parse(saved);
          if (data && data.profile) profile = data.profile;
        } catch (_) { }
      }
      if (!profile) {
        profile = { displayName: "Duane Harris", email: "tueini@gmail.com", phoneNumber: "(508) 494-0905", role: "admin" };
      }
      sessionStorage.setItem('wardLeaderProfile', JSON.stringify(profile));
      sessionStorage.setItem('wardAdminAuth', 'true');
      setSSOCookie(profile);
      checkAuth();
    }
  } catch (err) {
    if (err && err.name !== 'AbortError' && err.name !== 'NotAllowedError') {
      console.warn("Passkey autofill:", err);
    }
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
  if (!profile) profile = { displayName: "Ward Leader", role: "admin", phoneNumber: "admin" };

  try {
    const challenge = new Uint8Array(32);
    crypto.getRandomValues(challenge);

    const credential = await navigator.credentials.create({
      publicKey: {
        challenge: challenge,
        rp: { name: "Blackstone Ward Hub", id: window.location.hostname },
        user: {
          id: new TextEncoder().encode(profile.phoneNumber || "admin"),
          name: profile.phoneNumber || "admin",
          displayName: profile.displayName || "Ward Leader"
        },
        pubKeyCredParams: [
          { alg: -7, type: "public-key" },
          { alg: -257, type: "public-key" }
        ],
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          userVerification: "preferred",
          residentKey: "preferred"
        },
        timeout: 60000
      }
    });

    if (credential) {
      localStorage.setItem('wardPasskeyRegistered', JSON.stringify({
        id: credential.id,
        profile: profile
      }));
      alert("TouchID / FaceID successfully enabled for this device!");
      const btn = document.getElementById('btn-enroll-passkey');
      if (btn) btn.classList.add('hidden');
      const promptModal = document.getElementById('passkey-prompt-modal');
      if (promptModal) promptModal.classList.add('hidden');
    }
  } catch (e) {
    if (e.name !== 'NotAllowedError') {
      console.error("Passkey error:", e);
      alert("Could not register passkey: " + e.message);
    }
  }
}

function maybeShowPasskeyOnboardingPrompt(profile) {
  if (!window.PublicKeyCredential) return;
  if (localStorage.getItem('wardPasskeyRegistered')) return;
  if (localStorage.getItem('wardPasskeyPromptDismissed')) return;

  const modal = document.getElementById('passkey-prompt-modal');
  const nameEl = document.getElementById('passkey-prompt-leader-name');
  if (!modal) return;

  const firstName = (profile?.displayName || 'Leader').trim().split(/\s+/)[0];
  if (nameEl) nameEl.textContent = firstName;

  setTimeout(() => {
    if (sessionStorage.getItem('wardAdminAuth') === 'true' && !localStorage.getItem('wardPasskeyRegistered')) {
      modal.classList.remove('hidden');
    }
  }, 700);
}

async function handlePasskeyLogin() {
  if (!window.PublicKeyCredential) {
    alert("TouchID / FaceID is not supported on this browser.");
    return;
  }

  if (passkeyAutofillAbortController) {
    passkeyAutofillAbortController.abort();
    passkeyAutofillAbortController = null;
  }

  try {
    const challenge = new Uint8Array(32);
    crypto.getRandomValues(challenge);

    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: challenge,
        timeout: 60000,
        userVerification: "preferred"
      }
    });

    if (assertion) {
      let profile = null;
      const saved = localStorage.getItem('wardPasskeyRegistered');
      if (saved) {
        try {
          const data = JSON.parse(saved);
          if (data && data.profile) profile = data.profile;
        } catch (_) { }
      }
      if (!profile) {
        profile = { displayName: "Duane Harris", email: "tueini@gmail.com", phoneNumber: "(508) 494-0905", role: "admin" };
      }
      sessionStorage.setItem('wardLeaderProfile', JSON.stringify(profile));
      sessionStorage.setItem('wardAdminAuth', 'true');
      setSSOCookie(profile);
      checkAuth();
    }
  } catch (e) {
    if (e.name !== 'NotAllowedError') {
      console.error("Passkey login error:", e);
      alert("TouchID / FaceID verification failed or not set up yet. Please sign in with phone text first to enable TouchID.");
    }
    if (sessionStorage.getItem('wardAdminAuth') !== 'true') {
      initPasskeyAutofill();
    }
  }
}

function checkAuth() {
  const isAuth = sessionStorage.getItem('wardAdminAuth') === 'true';
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
    if (!profile || profile.displayName === 'Master Admin' || !profile.email) {
      profile = {
        displayName: "Duane Harris",
        email: "tueini@gmail.com",
        phoneNumber: "(508) 494-0905",
        role: "admin"
      };
      sessionStorage.setItem('wardLeaderProfile', JSON.stringify(profile));
    }
    currentLeaderProfile = profile;
    setSSOCookie(profile);

    const badge = document.getElementById('leader-identity-badge');
    const nameEl = document.getElementById('leader-display-name');
    const roleEl = document.getElementById('leader-role-label');
    const emailEl = document.getElementById('leader-email-label');
    const initialsEl = document.getElementById('leader-avatar-initials');

    if (badge && nameEl) {
      nameEl.textContent = profile.displayName || 'Duane Harris';
      if (emailEl) emailEl.textContent = profile.email || profile.phoneNumber || 'tueini@gmail.com';
      if (roleEl) {
        const roleDef = ROLE_DEFINITIONS[profile.role] || { label: 'Ward Administrator', fullAccess: true };
        roleEl.textContent = roleDef.label;
      }
      if (initialsEl) {
        const parts = (profile.displayName || 'Duane Harris').trim().split(/\s+/);
        const initials = parts.length > 1 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : parts[0].slice(0, 2).toUpperCase();
        initialsEl.textContent = initials;
        initialsEl.style.color = '#ffffff';
      }
      badge.classList.remove('hidden');
      badge.classList.add('flex');
    }

    // Passkey enroll button
    const enrollBtn = document.getElementById('btn-enroll-passkey');
    if (enrollBtn && window.PublicKeyCredential) {
      const hasPasskey = !!localStorage.getItem('wardPasskeyRegistered');
      if (!hasPasskey) {
        enrollBtn.classList.remove('hidden');
        enrollBtn.classList.add('flex');
      } else {
        enrollBtn.classList.add('hidden');
      }
    }

    maybeShowPasskeyOnboardingPrompt(profile);

    // Role-Based Access Control on UI:
    // Authorized Leaders tab is accessible to all leaders so org users can change passwords in their own org
    const tabLead = document.getElementById('tab-leaders');
    if (tabLead) {
      tabLead.classList.remove('hidden');
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

    // Show TouchID / FaceID button if browser supports biometrics/WebAuthn
    const passkeyBox = document.getElementById('passkey-login-container');
    if (passkeyBox) {
      if (window.PublicKeyCredential) {
        passkeyBox.classList.remove('hidden');
      } else {
        passkeyBox.classList.add('hidden');
      }
    }

    initPasskeyAutofill();
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
      err.textContent = "Please type both your first and last name (e.g. Duane Harris).";
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
    const rawHash = await computeSha256(val);
    const lowerHash = await computeSha256(val.toLowerCase());

    const validHashes = new Set([
      window.SECURE_AUTH_HASHES?.MASTER,
      window.SECURE_AUTH_HASHES?.WARD,
      ...(window.MASTER_APPROVED_HASHES || []),
      ...AUTHORIZED_MASTER_HASHES
    ]);

    // 1. Check Master Passwords
    if (validHashes.has(rawHash) || validHashes.has(lowerHash)) {
      let profile = {
        displayName: "Duane Harris",
        email: "tueini@gmail.com",
        phoneNumber: "+15084940905",
        role: "admin"
      };
      if (leaderName) {
        const match = leadersCache.find(l => (l.displayName || '').toLowerCase().includes(leaderName.toLowerCase()));
        if (match) profile = { ...match };
      }
      sessionStorage.setItem('wardLeaderProfile', JSON.stringify(profile));
      sessionStorage.setItem('wardAdminAuth', 'true');
      setSSOCookie(profile);
      input.value = '';
      if (btn) btn.textContent = 'Sign In with Password';
      checkAuth();
      return;
    }

    // 2. Check Personal Leader Passwords
    let matchedLeader = null;
    if (leaderName) {
      const cleanName = leaderName.toLowerCase();
      matchedLeader = leadersCache.find(l => (l.displayName || '').toLowerCase() === cleanName) ||
        leadersCache.find(l => (l.displayName || '').toLowerCase().includes(cleanName));
    }

    if (matchedLeader) {
      if (!matchedLeader.passwordHash) {
        if (err) {
          err.textContent = `No personal password has been set for ${matchedLeader.displayName} yet. Please sign in via phone text code or click "Forgot password?" to set one.`;
          err.classList.remove('hidden');
        }
        if (btn) btn.textContent = 'Sign In with Password';
        return;
      }
      if (matchedLeader.passwordHash === rawHash || matchedLeader.passwordHash === lowerHash) {
        if (matchedLeader.active === false) {
          if (err) {
            err.textContent = "This leader account is currently deactivated. Please contact an administrator.";
            err.classList.remove('hidden');
          }
          if (btn) btn.textContent = 'Sign In with Password';
          return;
        }
        sessionStorage.setItem('wardLeaderProfile', JSON.stringify(matchedLeader));
        sessionStorage.setItem('wardAdminAuth', 'true');
        setSSOCookie(matchedLeader);
        input.value = '';
        if (btn) btn.textContent = 'Sign In with Password';
        checkAuth();
        return;
      } else {
        if (err) {
          err.textContent = `Incorrect password for ${matchedLeader.displayName}. Please try again or click "Forgot password?".`;
          err.classList.remove('hidden');
        }
        if (btn) btn.textContent = 'Sign In with Password';
        if (input) { input.select(); input.focus(); }
        return;
      }
    }

    // If no leader name was specified, check if the password matches any active leader's personal password
    const matchingLeader = leadersCache.find(l => l.active !== false && (l.passwordHash === rawHash || l.passwordHash === lowerHash));
    if (matchingLeader) {
      sessionStorage.setItem('wardLeaderProfile', JSON.stringify(matchingLeader));
      sessionStorage.setItem('wardAdminAuth', 'true');
      setSSOCookie(matchingLeader);
      input.value = '';
      if (btn) btn.textContent = 'Sign In with Password';
      checkAuth();
      return;
    }

    if (err) {
      err.textContent = "Incorrect password. If you don't have a personal password, sign in via phone text or click 'Forgot password?'.";
      err.classList.remove('hidden');
    }
    if (btn) btn.textContent = 'Sign In with Password';
    if (input) {
      input.select();
      input.focus();
    }
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
  currentLeaderProfile = null;
  try {
    await signOut(auth);
  } catch (_) { }

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

  // 2. ward_announcements
  unsubAnn = onSnapshot(collection(db, "ward_announcements"), (snapshot) => {
    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      const existing = announcementsCache.findIndex(a => a.id === docSnap.id);
      if (existing >= 0) announcementsCache[existing] = { id: docSnap.id, ...data };
      else announcementsCache.push({ id: docSnap.id, ...data });
    });
    announcementsCache.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
    try { localStorage.setItem('local_ward_announcements', JSON.stringify(announcementsCache)); } catch (_) { }
    renderAnnouncements();
  }, (err) => {
    console.warn("Firestore ward_announcements error:", err);
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
    leadersCache = [];
    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      leadersCache.push({ id: docSnap.id, ...data });
    });

    // Ensure Duane Harris is always present in the leaders registry
    const hasDuane = leadersCache.some(l => l.phoneNumber === '+15084940905' || l.id === 'leader_duane_harris' || l.displayName === 'Duane Harris');
    if (!hasDuane) {
      const duaneData = {
        displayName: "Duane Harris",
        email: "tueini@gmail.com",
        phoneNumber: "+15084940905",
        role: "admin",
        active: true,
        createdAt: new Date().toISOString()
      };
      leadersCache.unshift({ id: 'leader_duane_harris', ...duaneData });
      setDoc(doc(db, "ward_leaders", "leader_duane_harris"), duaneData, { merge: true }).catch(() => { });
    }

    renderLeadersTable();
  }, (err) => {
    console.error("Firestore ward_leaders error:", err);
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
    const time24 = formatTimeTo24(evTime);
    const startAt = evDate ? `${evDate}T${time24}-04:00` : null;

    const wardEvent = {
      id: newId,
      title: evTitle,
      date: evDate,
      time: evTime,
      startAt: startAt,
      allDay: !evTime,
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

  document.getElementById('event-id').value = eventData.id || '';
  document.getElementById('event-title').value = eventData.title || eventData.name || '';
  document.getElementById('event-date').value = eventData.date || '';
  document.getElementById('event-time').value = eventData.time || '';
  document.getElementById('event-allday').checked = eventData.allDay === true;
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
  const time = document.getElementById('event-time').value.trim();
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
  const time24 = formatTimeTo24(time);
  const startAt = `${date}T${allDay ? '00:00:00' : time24}-04:00`;

  const payload = {
    title,
    name: title,
    date,
    time,
    allDay,
    startAt,
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
  deleteDoc(doc(db, "home_announcements", id)).catch(() => { });
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
  deleteDoc(doc(db, "home_spotlights", id)).catch(() => { });
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

function renderLeadersTable() {
  const tbody = document.getElementById('leaders-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';
  selectedLeaderIds.clear();
  updateLeadersBulkBar();

  if (leadersCache.length === 0) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td colspan="7" class="px-4 py-8 text-center text-slate-400">
        <p class="font-medium text-sm">No registered leaders yet.</p>
        <p class="text-xs mt-1">Click "+ Add Ward Leader" above to register a cell phone number for passwordless login.</p>
      </td>
    `;
    tbody.appendChild(tr);
    return;
  }

  leadersCache.forEach(leader => {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-slate-50 transition';

    const roleInfo = ROLE_DEFINITIONS[leader.role] || { label: leader.role || 'Leader', org: 'Ward' };

    let statusBadge = '';
    if (leader.onboarded) {
      statusBadge = '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-100 text-emerald-800"><span class="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>Onboarded</span>';
    } else if (leader.active !== false) {
      statusBadge = '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-50 text-blue-800 border border-blue-200">Active</span>';
    } else {
      statusBadge = '<span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-600">Inactive</span>';
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
        <span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-50 text-blue-800 border border-blue-200">
          ${escapeHtml(roleInfo.label)}
        </span>
      </td>
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
        document.querySelectorAll('.leader-action-menu').forEach(m => m.classList.add('hidden'));
        if (isHidden) actionMenu.classList.remove('hidden');
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
  const email = leader.email || '—';

  document.getElementById('onboard-modal-title').textContent = `Onboard: ${name}`;
  document.getElementById('onboard-name-val').textContent = name;
  document.getElementById('onboard-role-badge').textContent = roleInfo.label;
  document.getElementById('onboard-phone-val').textContent = formattedPhone;
  document.getElementById('onboard-email-val').textContent = email;

  const inviteMsg = `Hello ${name},\n\nYou have been registered with leadership access to the Blackstone Ward Administration Portal as ${roleInfo.label}.\n\nTo sign in:\n1. Visit: https://test.blackstoneward.org/admin/\n2. Select your name or enter your phone: ${formattedPhone}\n3. Click "Send Text Code" and enter your 6-digit verification code.\n\nWelcome to the leadership portal!`;

  const msgTextarea = document.getElementById('onboard-message-text');
  if (msgTextarea) msgTextarea.value = inviteMsg;

  const smsLink = document.getElementById('onboard-sms-link');
  if (smsLink) {
    const rawDigits = formattedPhone.replace(/[^\d+]/g, '');
    smsLink.href = `sms:${rawDigits}?&body=${encodeURIComponent(inviteMsg)}`;
  }

  const copyBtn = document.getElementById('onboard-copy-btn');
  const copyText = document.getElementById('onboard-copy-text');
  if (copyBtn) {
    copyBtn.onclick = async () => {
      try {
        await navigator.clipboard.writeText(inviteMsg);
        if (copyText) copyText.textContent = "✓ Copied!";
        setTimeout(() => { if (copyText) copyText.textContent = "Copy Invitation"; }, 2000);
      } catch (_) {
        alert("Invitation text copied to clipboard!");
      }
    };
  }

  const markBtn = document.getElementById('onboard-mark-btn');
  const markText = document.getElementById('onboard-mark-text');
  if (markBtn) {
    if (leader.onboarded) {
      if (markText) markText.textContent = "✓ Already Onboarded (Click to Re-confirm)";
    } else {
      if (markText) markText.textContent = "Mark Leader as Onboarded";
    }
    markBtn.onclick = async () => {
      leader.onboarded = true;
      leader.onboardedAt = new Date().toISOString();
      const idx = leadersCache.findIndex(l => l.id === leader.id);
      if (idx >= 0) leadersCache[idx] = leader;
      try { localStorage.setItem('local_ward_leaders', JSON.stringify(leadersCache)); } catch (_) { }
      renderLeadersTable();
      if (markText) markText.textContent = "✓ Marked Onboarded!";
      setDoc(doc(db, "ward_leaders", leader.id), { onboarded: true, onboardedAt: leader.onboardedAt }, { merge: true }).catch(() => { });
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

  const roleSelect = document.getElementById('leader-role');
  if (roleSelect) {
    // Only Ward Admin can assign the Ward Administrator role
    const adminOpt = roleSelect.querySelector('option[value="admin"]');
    if (adminOpt) {
      if (currentLeaderProfile?.role === 'admin') {
        adminOpt.disabled = false;
        adminOpt.classList.remove('hidden');
      } else {
        adminOpt.disabled = true;
        adminOpt.classList.add('hidden');
      }
    }
    roleSelect.value = leader?.role || (currentLeaderProfile?.role === 'admin' ? 'relief_society' : 'relief_society');
  }

  document.getElementById('leader-active').checked = leader ? leader.active !== false : true;

  const pwInput = document.getElementById('leader-password');
  const pwStatus = document.getElementById('leader-password-status');
  if (pwInput) pwInput.value = '';
  if (pwStatus) {
    if (leader && leader.passwordHash) {
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
  const role = document.getElementById('leader-role').value;
  const active = document.getElementById('leader-active').checked;
  const newPw = (document.getElementById('leader-password')?.value || '').trim();

  if (idInput) {
    const existing = leadersCache.find(l => l.id === idInput);
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

  // Restrict creating or assigning the Ward Administrator role
  if (role === 'admin' && currentLeaderProfile?.role !== 'admin') {
    alert("Permission denied: Only the Ward Administrator can assign the Ward Administrator role.");
    return;
  }

  if (!name || !rawPhone) {
    alert("Please provide both the leader's name and cell phone number.");
    return;
  }

  const phone = normalizePhone(rawPhone);
  if (phone.length < 11) {
    alert("Please enter a valid 10-digit mobile phone number.");
    return;
  }

  const id = idInput || `leader_${Date.now()}`;
  const payload = {
    displayName: name,
    email: email,
    phoneNumber: phone,
    role: role,
    active: active,
    updatedAt: new Date().toISOString()
  };

  const existingIdx = leadersCache.findIndex(l => l.id === id);
  if (newPw) {
    if (idInput && existingIdx >= 0) {
      if (!canUserChangePassword(leadersCache[existingIdx])) {
        alert("Permission denied: You do not have permission to set a password for this user.");
        return;
      }
    }
    payload.passwordHash = await computeSha256(newPw);
  } else if (existingIdx >= 0 && leadersCache[existingIdx].passwordHash) {
    payload.passwordHash = leadersCache[existingIdx].passwordHash;
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
  document.getElementById('admin-set-pw-role').textContent = roleInfo.label;
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

  const hash = await computeSha256(password);
  leader.passwordHash = hash;
  leader.updatedAt = new Date().toISOString();

  const idx = leadersCache.findIndex(l => l.id === leaderId);
  if (idx >= 0) leadersCache[idx] = leader;
  try { localStorage.setItem('local_ward_leaders', JSON.stringify(leadersCache)); } catch (_) { }

  renderLeadersTable();
  closeModals();

  try {
    await setDoc(doc(db, "ward_leaders", leaderId), {
      passwordHash: hash,
      updatedAt: leader.updatedAt
    }, { merge: true });
    alert(`Personal password for ${leader.displayName} has been saved!`);
  } catch (err) {
    console.warn("Set password cloud warning:", err);
    alert(`Personal password for ${leader.displayName} saved locally.`);
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
  deleteDoc(doc(db, "ward_leaders", id)).catch(err => console.warn("Delete leader cloud sync:", err));
}

// ================= MODAL CONTROLS =================
function closeModals() {
  document.querySelectorAll('#youth-import-modal, #event-modal, #announcement-modal, #spotlight-modal, #day-modal, #leader-modal, #onboard-modal, #admin-set-pw-modal, #reset-password-modal').forEach(m => {
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
}

// ================= INITIALIZE =================
document.addEventListener('DOMContentLoaded', () => {
  setupNavigation();
  setupModalTriggers();

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
  const passkeyBtn = document.getElementById('passkey-login-btn');
  if (passkeyBtn) passkeyBtn.addEventListener('click', handlePasskeyLogin);

  const enrollPasskeyBtn = document.getElementById('btn-enroll-passkey');
  if (enrollPasskeyBtn) enrollPasskeyBtn.addEventListener('click', handleEnrollPasskey);

  // TouchID / Passkey First-Login Onboarding Prompt Listeners
  const btnPromptEnable = document.getElementById('btn-prompt-enable-passkey');
  if (btnPromptEnable) {
    btnPromptEnable.addEventListener('click', async () => {
      const modal = document.getElementById('passkey-prompt-modal');
      if (modal) modal.classList.add('hidden');
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
    btnBulkOnboard.addEventListener('click', async () => {
      if (selectedLeaderIds.size === 0) return;
      const validLeadersToOnboard = Array.from(selectedLeaderIds).map(id => leadersCache.find(l => l.id === id)).filter(l => l && canUserOnboardLeader(l));
      if (validLeadersToOnboard.length === 0) {
        alert("Permission denied: None of the selected leaders can be onboarded with your current permissions.");
        return;
      }
      if (!confirm(`Mark ${validLeadersToOnboard.length} selected leader(s) as Onboarded?`)) return;
      const now = new Date().toISOString();
      validLeadersToOnboard.forEach(l => {
        l.onboarded = true;
        l.onboardedAt = now;
        setDoc(doc(db, "ward_leaders", l.id), { onboarded: true, onboardedAt: now }, { merge: true }).catch(() => { });
      });
      try { localStorage.setItem('local_ward_leaders', JSON.stringify(leadersCache)); } catch (_) { }
      renderLeadersTable();
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
        deleteDoc(doc(db, "ward_leaders", id)).catch(() => { });
      });
    });
  }

  // Password Form Submit
  if (passcodeForm) passcodeForm.addEventListener('submit', handleLogin);
  document.getElementById('logout-btn').addEventListener('click', handleLogout);

  // Close leader action menus when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.leader-action-dropdown-wrap')) {
      document.querySelectorAll('.leader-action-menu').forEach(m => m.classList.add('hidden'));
    }
  });

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

    const hash = await computeSha256(pw);
    const now = new Date().toISOString();

    if (leader) {
      leader.passwordHash = hash;
      leader.updatedAt = now;
      const idx = leadersCache.findIndex(l => l.id === leader.id);
      if (idx >= 0) leadersCache[idx] = leader;
      try { localStorage.setItem('local_ward_leaders', JSON.stringify(leadersCache)); } catch (_) { }
      setDoc(doc(db, "ward_leaders", leader.id), { passwordHash: hash, updatedAt: now }, { merge: true }).catch(() => { });
    } else if (phoneVal === '+15084940905') {
      const duaneId = "leader_duane_harris";
      const duane = {
        displayName: "Duane Harris",
        email: "tueini@gmail.com",
        phoneNumber: "+15084940905",
        role: "admin",
        active: true,
        passwordHash: hash,
        updatedAt: now
      };
      const idx = leadersCache.findIndex(l => l.id === duaneId || l.phoneNumber === '+15084940905');
      if (idx >= 0) leadersCache[idx] = { ...leadersCache[idx], ...duane };
      else leadersCache.unshift({ id: duaneId, ...duane });
      try { localStorage.setItem('local_ward_leaders', JSON.stringify(leadersCache)); } catch (_) { }
      setDoc(doc(db, "ward_leaders", duaneId), duane, { merge: true }).catch(() => { });
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
  const matchIndicator = document.getElementById('leader-match-indicator');
  const matchText = document.getElementById('leader-match-text');

  if (!nameInput) return;

  function handleNameMatch(val) {
    if (!val) {
      if (matchIndicator) {
        matchIndicator.classList.add('hidden');
        matchIndicator.classList.remove('flex');
      }
      return;
    }
    const pool = [...leadersCache];
    if (!pool.some(l => l.displayName === 'Duane Harris')) {
      pool.unshift({
        displayName: "Duane Harris",
        phoneNumber: "(508) 494-0905",
        role: "admin",
        active: true
      });
    }
    const cleanVal = val.trim().toLowerCase();
    const match = pool.find(l => (l.displayName || '').toLowerCase() === cleanVal) ||
      pool.find(l => (l.displayName || '').toLowerCase().includes(cleanVal));

    if (match) {
      const roleInfo = ROLE_DEFINITIONS[match.role] || { label: 'Leader' };
      if (matchText) matchText.textContent = `${match.displayName} (${roleInfo.label})`;
      if (matchIndicator) {
        matchIndicator.classList.remove('hidden');
        matchIndicator.classList.add('flex');
      }
    } else {
      if (matchIndicator) {
        matchIndicator.classList.add('hidden');
        matchIndicator.classList.remove('flex');
      }
    }
  }

  nameInput.addEventListener('input', () => handleNameMatch(nameInput.value));
  nameInput.addEventListener('change', () => handleNameMatch(nameInput.value));

  const pwLookup = document.getElementById('password-leader-lookup');
  if (pwLookup) {
    pwLookup.addEventListener('input', () => handleNameMatch(pwLookup.value));
    pwLookup.addEventListener('change', () => handleNameMatch(pwLookup.value));
  }

  // Pre-load leaders from localStorage if available
  try {
    const saved = JSON.parse(localStorage.getItem('local_ward_leaders') || '[]');
    if (saved.length > 0 && leadersCache.length === 0) {
      leadersCache = saved;
    }
  } catch (_) { }
  updateDatalist();

  // Async refresh from Firestore
  getDocs(collection(db, "ward_leaders")).then(snap => {
    if (!snap.empty) {
      leadersCache = [];
      snap.forEach(d => leadersCache.push({ id: d.id, ...d.data() }));
      if (!leadersCache.some(l => l.displayName === 'Duane Harris')) {
        leadersCache.unshift({
          id: 'leader_duane_harris',
          displayName: "Duane Harris",
          email: "tueini@gmail.com",
          phoneNumber: "(508) 494-0905",
          role: "admin",
          active: true
        });
      }
      try { localStorage.setItem('local_ward_leaders', JSON.stringify(leadersCache)); } catch (_) { }
      updateDatalist();
    }
  }).catch(() => { });
}
