const crypto = require('node:crypto');
const { onRequest } = require('firebase-functions/v2/https');
const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');
const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse
} = require('@simplewebauthn/server');

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const CHALLENGES_COLLECTION = 'webauthn_challenges';
const PASSKEYS_COLLECTION = 'ward_passkeys';
const LEADERS_COLLECTION = 'ward_leaders';
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

const ALLOWED_ORIGINS = new Set([
  'https://blackstoneward.org',
  'https://www.blackstoneward.org',
  'https://test.blackstoneward.org',
  'https://bish.blackstoneward.org',
  'https://youth.blackstoneward.org',
  'https://blackstoneward-b861c.web.app',
  'https://blackstoneward-b861c.firebaseapp.com',
  'https://test-blackstoneward.web.app',
  'https://test-blackstoneward.firebaseapp.com'
]);

const BISHOPRIC_NAMES = new Set([
  'duane harris',
  'john truscott',
  'garrett bourne',
  'cole houston',
  'brian mcdonald'
]);

function isAllowedOrigin(origin) {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.has(origin)) return true;
  try {
    const url = new URL(origin);
    if (url.protocol === 'https:' && (url.hostname === 'blackstoneward.org' || url.hostname.endsWith('.blackstoneward.org'))) {
      return true;
    }
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
      return true;
    }
  } catch (_) {
    return false;
  }
  return false;
}

function getRpIdFromOrigin(origin) {
  try {
    const { hostname } = new URL(origin);
    if (hostname === 'blackstoneward.org' || hostname.endsWith('.blackstoneward.org')) {
      return 'blackstoneward.org';
    }
    return hostname;
  } catch (_) {
    return 'blackstoneward.org';
  }
}

function setCorsHeaders(req, res) {
  const origin = req.headers.origin;
  if (isAllowedOrigin(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Vary', 'Origin');
  }
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.set('Access-Control-Max-Age', '3600');
}

function normalizeText(val) {
  return String(val || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function base64urlEncode(buf) {
  return Buffer.from(buf).toString('base64url');
}

function base64urlDecode(str) {
  return new Uint8Array(Buffer.from(String(str || ''), 'base64url'));
}

async function resolveLeaderProfile(rawProfile) {
  if (!rawProfile || typeof rawProfile !== 'object') return null;
  const leaderId = String(rawProfile.id || '').trim();
  const displayName = String(rawProfile.displayName || '').trim();
  const normName = normalizeText(displayName);

  if (leaderId) {
    const docSnap = await db.collection(LEADERS_COLLECTION).doc(leaderId).get();
    if (docSnap.exists) {
      return { id: docSnap.id, ...docSnap.data() };
    }
  }

  if (normName) {
    const snap = await db.collection(LEADERS_COLLECTION).get();
    for (const d of snap.docs) {
      const data = d.data() || {};
      if (normalizeText(data.displayName) === normName) {
        return { id: d.id, ...data };
      }
    }
  }

  if (displayName) {
    return {
      id: leaderId || `leader_${normName.replace(/[^a-z0-9]+/g, '_')}`,
      displayName,
      email: String(rawProfile.email || '').trim(),
      phoneNumber: String(rawProfile.phoneNumber || '').trim(),
      role: String(rawProfile.role || 'leader').trim(),
      calling: String(rawProfile.calling || '').trim(),
      org: String(rawProfile.org || '').trim(),
      accessAreas: Array.isArray(rawProfile.accessAreas) ? rawProfile.accessAreas : []
    };
  }
  return null;
}

function isBishopricLeader(profile) {
  if (!profile) return false;
  const role = normalizeText(profile.role);
  if (role === 'admin' || role === 'bishopric') return true;
  if (BISHOPRIC_NAMES.has(normalizeText(profile.displayName))) return true;
  return false;
}

async function createChallengeRecord(payload) {
  const challengeId = crypto.randomBytes(24).toString('base64url');
  await db.collection(CHALLENGES_COLLECTION).doc(challengeId).set({
    ...payload,
    createdAt: Date.now(),
    expiresAt: Date.now() + CHALLENGE_TTL_MS
  });
  return challengeId;
}

async function consumeChallengeRecord(challengeId) {
  if (!challengeId || typeof challengeId !== 'string') return null;
  const ref = db.collection(CHALLENGES_COLLECTION).doc(challengeId);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const data = snap.data();
  await ref.delete().catch(() => { });
  if (!data || Date.now() > Number(data.expiresAt || 0)) {
    return null;
  }
  return data;
}

// passkeyApi 1.1.0 (2026-11-22, Duane voice 9:04 PM ET): passkey ENROLLMENT requires a Firebase sign-in that belongs
// to the leader being enrolled. Before 1.1.0, /register/options and /register/verify trusted the leader id sent by the
// browser with no sign-in check, so anyone could add a passkey to any leader record. Allowed callers (Bearer ID token,
// verified with revocation check): a passkey (custom-token) session whose uid is the leader doc id, or a text-message
// (phone) session whose verified number matches the leader record's phoneNumber in one of the 14 stored formats the
// tightened Firestore rules accept. The leader record must exist and be active. Login endpoints are unchanged.
// passkeyApi 1.2.0 (functions 1.2.3, Duane voice 10:58 PM ET): a Google (google.com) session may also enroll when its
// email is verified by Google and equals the leader record's email (trimmed, case-insensitive). Same 401/403 order.
const ENROLL_SIGNIN_REQUIRED = 'Sign in by text message or Google first to add a passkey.';
const ENROLL_SIGNIN_INVALID = 'Your sign-in has expired or was revoked. Sign in again by text message or Google, then add the passkey.';
const ENROLL_NOT_YOURS = 'This sign-in does not belong to the leader this passkey is for. Sign in as that leader, then try again.';
const ENROLL_NO_RECORD = 'No active leader record was found for this passkey.';

function leaderPhoneVariants(e164) {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(String(e164 || ''));
  if (!m) return e164 ? [String(e164)] : [];
  const [, a, b, c] = m;
  const d = a + b + c;
  return [`+1${d}`, d, `1${d}`, `(${a}) ${b}-${c}`, `(${a})${b}-${c}`, `${a}-${b}-${c}`, `${a}.${b}.${c}`, `${a} ${b} ${c}`,
    `+1 ${a} ${b} ${c}`, `+1 (${a}) ${b}-${c}`, `+1-${a}-${b}-${c}`, `+1 ${a}-${b}-${c}`, `1-${a}-${b}-${c}`, `1 (${a}) ${b}-${c}`];
}

async function verifyEnrollCaller(req) {
  const m = /^Bearer\s+(\S+)$/i.exec(String(req.headers.authorization || ''));
  if (!m) return { ok: false, status: 401, code: 'signin-required', error: ENROLL_SIGNIN_REQUIRED };
  try {
    const t = await admin.auth().verifyIdToken(m[1], true);
    return { ok: true, uid: t.uid, provider: (t.firebase && t.firebase.sign_in_provider) || '', phone: t.phone_number || '',
      email: typeof t.email === 'string' ? t.email.trim().toLowerCase() : '', emailVerified: t.email_verified === true };
  } catch (e) {
    console.warn('passkey enroll: ID token rejected:', (e && e.code) || 'invalid');
    return { ok: false, status: 401, code: 'signin-invalid', error: ENROLL_SIGNIN_INVALID };
  }
}

function enrollAllowed(caller, leaderId, leader) {
  if (!leader || leader.active === false) return { ok: false, status: 403, code: 'no-active-record', error: ENROLL_NO_RECORD };
  if (caller.provider === 'custom' && caller.uid === leaderId) return { ok: true };
  if (caller.provider === 'phone' && /^\+1\d{10}$/.test(caller.phone)
    && leaderPhoneVariants(caller.phone).includes(String(leader.phoneNumber || ''))) return { ok: true };
  // passkeyApi 1.2.0: Google session whose Google-verified email is this leader record's email
  if (caller.provider === 'google.com' && caller.emailVerified && caller.email
    && String(leader.email || '').trim().toLowerCase() === caller.email) return { ok: true };
  return { ok: false, status: 403, code: 'not-this-leader', error: ENROLL_NOT_YOURS };
}

async function leaderRecordData(leaderId) {
  if (!leaderId) return null;
  const snap = await db.collection(LEADERS_COLLECTION).doc(String(leaderId)).get();
  return snap.exists ? snap.data() : null;
}

function sendEnrollError(res, verdict) {
  res.status(verdict.status).json({ error: verdict.error, code: verdict.code });
}

// Reads a challenge without deleting it, so a rejected caller cannot burn someone else's challenge.
async function peekChallengeRecord(challengeId) {
  if (!challengeId || typeof challengeId !== 'string') return null;
  const snap = await db.collection(CHALLENGES_COLLECTION).doc(challengeId).get();
  if (!snap.exists) return null;
  const data = snap.data();
  if (!data || Date.now() > Number(data.expiresAt || 0)) return null;
  return data;
}

async function handleRegisterOptions(req, res, origin) {
  // passkeyApi 1.1.0: sign-in check first (401), then the leader-record check (403).
  const caller = await verifyEnrollCaller(req);
  if (!caller.ok) {
    sendEnrollError(res, caller);
    return;
  }
  const { leaderProfile } = req.body || {};
  const profile = await resolveLeaderProfile(leaderProfile);
  if (!profile || !profile.id) {
    res.status(400).json({ error: 'Valid leader profile is required to register a passkey.' });
    return;
  }
  const enrollVerdict = enrollAllowed(caller, String(profile.id), await leaderRecordData(profile.id));
  if (!enrollVerdict.ok) {
    sendEnrollError(res, enrollVerdict);
    return;
  }

  const rpID = getRpIdFromOrigin(origin);
  const existingSnap = await db
    .collection(PASSKEYS_COLLECTION)
    .where('leaderId', '==', profile.id)
    .get();

  const excludeCredentials = existingSnap.docs
    .map((d) => d.data())
    .filter((d) => d && d.credentialId)
    .map((d) => ({
      id: d.credentialId,
      transports: Array.isArray(d.transports) ? d.transports : ['internal']
    }));

  const options = await generateRegistrationOptions({
    rpName: 'Blackstone Ward Hub',
    rpID,
    userName: profile.email || profile.phoneNumber || profile.displayName || profile.id,
    userDisplayName: profile.displayName || 'Ward Leader',
    userID: new TextEncoder().encode(profile.id),
    attestationType: 'none',
    excludeCredentials,
    authenticatorSelection: {
      authenticatorAttachment: 'platform',
      userVerification: 'preferred',
      residentKey: 'preferred'
    },
    timeout: 60000
  });

  const challengeId = await createChallengeRecord({
    type: 'registration',
    challenge: options.challenge,
    rpID,
    origin,
    leaderId: profile.id,
    uid: caller.uid, // passkeyApi 1.1.0: /register/verify must come from the same sign-in
    profile: {
      id: profile.id,
      displayName: profile.displayName || '',
      email: profile.email || '',
      phoneNumber: profile.phoneNumber || '',
      role: profile.role || 'leader',
      calling: profile.calling || '',
      org: profile.org || '',
      accessAreas: Array.isArray(profile.accessAreas) ? profile.accessAreas : []
    }
  });

  res.status(200).json({ challengeId, options });
}

async function handleRegisterVerify(req, res) {
  const { challengeId, attestationResponse } = req.body || {};
  if (!challengeId || !attestationResponse) {
    res.status(400).json({ error: 'Missing challengeId or attestationResponse.' });
    return;
  }

  // passkeyApi 1.1.0: check the sign-in BEFORE consuming the challenge. The challenge must have been issued to the
  // same sign-in, and that sign-in must still belong to the (active) leader the challenge is for.
  const caller = await verifyEnrollCaller(req);
  if (!caller.ok) {
    sendEnrollError(res, caller);
    return;
  }
  const pending = await peekChallengeRecord(challengeId);
  if (pending && pending.type === 'registration') {
    if (!pending.uid || pending.uid !== caller.uid) {
      sendEnrollError(res, { status: 403, code: 'challenge-mismatch', error: ENROLL_NOT_YOURS });
      return;
    }
    const verdict = enrollAllowed(caller, String(pending.leaderId || ''), await leaderRecordData(pending.leaderId));
    if (!verdict.ok) {
      sendEnrollError(res, verdict);
      return;
    }
  }

  const challengeDoc = await consumeChallengeRecord(challengeId);
  if (!challengeDoc || challengeDoc.type !== 'registration') {
    res.status(400).json({ error: 'Registration challenge expired or invalid.' });
    return;
  }

  const verification = await verifyRegistrationResponse({
    response: attestationResponse,
    expectedChallenge: challengeDoc.challenge,
    expectedOrigin: challengeDoc.origin,
    expectedRPID: challengeDoc.rpID,
    requireUserVerification: false
  });

  if (!verification.verified || !verification.registrationInfo) {
    res.status(400).json({ error: 'Passkey registration verification failed.' });
    return;
  }

  const { credential } = verification.registrationInfo;
  const credentialId = credential.id;
  const publicKeyB64 = base64urlEncode(credential.publicKey);
  const transports = Array.isArray(attestationResponse.response?.transports)
    ? attestationResponse.response.transports
    : ['internal'];

  const nowIso = new Date().toISOString();
  await db.collection(PASSKEYS_COLLECTION).doc(credentialId).set({
    credentialId,
    publicKey: publicKeyB64,
    counter: credential.counter || 0,
    transports,
    rpID: challengeDoc.rpID,
    leaderId: challengeDoc.leaderId,
    profile: challengeDoc.profile,
    createdAt: nowIso,
    lastUsedAt: nowIso
  });

  await db.collection(LEADERS_COLLECTION).doc(challengeDoc.leaderId).set({
    passkeyEnrolled: true,
    passkeyUpdatedAt: nowIso
  }, { merge: true }).catch(() => { });

  res.status(200).json({
    verified: true,
    credentialId,
    profile: challengeDoc.profile
  });
}

async function handleLoginOptions(req, res, origin) {
  const { leaderName, requiredRole } = req.body || {};
  const rpID = getRpIdFromOrigin(origin);

  let allowCredentials;
  if (leaderName && normalizeText(leaderName)) {
    const profile = await resolveLeaderProfile({ displayName: leaderName });
    if (profile && profile.id) {
      const snap = await db
        .collection(PASSKEYS_COLLECTION)
        .where('leaderId', '==', profile.id)
        .get();
      if (!snap.empty) {
        allowCredentials = snap.docs
          .map((d) => d.data())
          .filter((d) => d && d.credentialId)
          .map((d) => ({
            id: d.credentialId,
            transports: Array.isArray(d.transports) ? d.transports : ['internal']
          }));
      }
    }
  }

  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: 'preferred',
    allowCredentials,
    timeout: 60000
  });

  const challengeId = await createChallengeRecord({
    type: 'authentication',
    challenge: options.challenge,
    rpID,
    origin,
    requiredRole: requiredRole || ''
  });

  res.status(200).json({ challengeId, options });
}

async function handleLoginVerify(req, res) {
  const { challengeId, assertionResponse, requiredRole } = req.body || {};
  if (!challengeId || !assertionResponse || !assertionResponse.id) {
    res.status(400).json({ error: 'Missing challengeId or assertionResponse.' });
    return;
  }

  const challengeDoc = await consumeChallengeRecord(challengeId);
  if (!challengeDoc || challengeDoc.type !== 'authentication') {
    res.status(400).json({ error: 'Authentication challenge expired or invalid.' });
    return;
  }

  const credRef = db.collection(PASSKEYS_COLLECTION).doc(assertionResponse.id);
  const credSnap = await credRef.get();
  if (!credSnap.exists) {
    res.status(404).json({ error: 'Passkey not found in server directory. Please sign in with SMS or password and re-enable Touch ID / Face ID.' });
    return;
  }

  const credData = credSnap.data();
  const verification = await verifyAuthenticationResponse({
    response: assertionResponse,
    expectedChallenge: challengeDoc.challenge,
    expectedOrigin: challengeDoc.origin,
    expectedRPID: challengeDoc.rpID,
    credential: {
      id: credData.credentialId,
      publicKey: base64urlDecode(credData.publicKey),
      counter: Number(credData.counter || 0),
      transports: Array.isArray(credData.transports) ? credData.transports : ['internal']
    },
    requireUserVerification: false
  });

  if (!verification.verified) {
    res.status(401).json({ error: 'Passkey signature verification failed.' });
    return;
  }

  const nowIso = new Date().toISOString();
  await credRef.set({
    counter: verification.authenticationInfo?.newCounter ?? Number(credData.counter || 0),
    lastUsedAt: nowIso
  }, { merge: true });

  // Refresh latest leader permissions from ward_leaders
  let profile = credData.profile || { id: credData.leaderId };
  if (credData.leaderId) {
    const leaderSnap = await db.collection(LEADERS_COLLECTION).doc(credData.leaderId).get();
    if (leaderSnap.exists) {
      profile = { id: leaderSnap.id, ...leaderSnap.data() };
    }
  }

  const effectiveRequiredRole = requiredRole || challengeDoc.requiredRole || '';
  if (effectiveRequiredRole === 'bishopric' && !isBishopricLeader(profile)) {
    res.status(403).json({ error: 'This passkey does not belong to an authorized member of the Blackstone Ward Bishopric.' });
    return;
  }

  const uid = String(profile.id || credData.leaderId || credData.credentialId);
  let customToken = null;
  try {
    customToken = await admin.auth().createCustomToken(uid, {
      role: String(profile.role || 'leader'),
      leaderId: uid,
      displayName: String(profile.displayName || '')
    });
  } catch (tokenErr) {
    console.warn('Could not mint custom token:', tokenErr?.message || tokenErr);
  }

  res.status(200).json({
    verified: true,
    customToken,
    profile: {
      id: uid,
      displayName: profile.displayName || '',
      email: profile.email || '',
      phoneNumber: profile.phoneNumber || '',
      role: profile.role || 'leader',
      calling: profile.calling || '',
      org: profile.org || '',
      accessAreas: Array.isArray(profile.accessAreas) ? profile.accessAreas : []
    }
  });
}

// passkeyApi 1.3.0 (functions 1.2.4, 2026-11-22, Duane voice 11:45 PM ET): personal leader password sign-in for the
// Bishopric Hub. POST /password/login { leaderName, password, requiredRole }. The server looks up the active ward_leaders
// record by display name (Admin SDK), compares the stored unsalted SHA-256 passwordHash with SHA-256 of the password as
// typed and lower-cased (the same two forms the hub checked in the browser before) using a timing-safe compare, and on
// success mints a custom token whose uid is 'pw_' + leaderId (NOT the leader doc id) with the claim pw: 1. Because
// ward_leaders/pw_<id> does not exist, the Firestore rules (bwPasskeyLeader, wpIsLeaderDoc) never treat this session
// as a leader: it gets no leader data. The hub then requires Touch ID (passkey) or a text code before it unlocks.
// Errors are generic; no record data is returned. Rate limits (fail closed): per IP and per leader, per hour.
// passkeyApi 1.4.0 (2026-11-23): scrypt storage + one-time SHA-256 migration (see PW_CRED_COLLECTION), success returns
// the leader's own non-secret profile, and POST /password/set sets a password on the server (handlePasswordSet).
const { Timestamp: PwTimestamp, FieldValue: PwFieldValue } = require('firebase-admin/firestore');
const PW_RATE_COLLECTION = 'pw_login_rate_limits';
const PW_RATE_PER_IP_PER_HOUR = 30;
const PW_FAILS_PER_LEADER_PER_HOUR = 5;
const PW_LOGIN_FAILED = 'Incorrect name or password.';
const PW_RATE_LIMITED = 'Too many sign-in attempts. Please wait an hour, or sign in with Touch ID or a text code.';
const PW_UNAVAILABLE = 'Password sign-in is unavailable right now. Please sign in with Touch ID or a text code.';

function pwSha(text) {
  return crypto.createHash('sha256').update(String(text), 'utf8').digest('hex');
}

function pwHourBucket(now = new Date()) {
  return now.toISOString().slice(0, 13);
}

function pwClientIp(req) {
  const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return fwd || String(req.ip || (req.socket && req.socket.remoteAddress) || 'unknown');
}

function pwHashMatches(storedHex, candidateHex) {
  const a = Buffer.from(/^[0-9a-f]{64}$/i.test(String(storedHex || '')) ? String(storedHex).toLowerCase() : '0'.repeat(64), 'hex');
  const b = Buffer.from(candidateHex, 'hex');
  return crypto.timingSafeEqual(a, b) && /^[0-9a-f]{64}$/i.test(String(storedHex || ''));
}

// passkeyApi 1.4.0 (functions 1.2.5, Duane 2026-11-23, #2): personal passwords are stored as salted scrypt hashes in
// ward_leader_credentials/{leaderId}. That collection has no match in firestore.rules, so every browser read and write
// is denied; only this function (Admin SDK) uses it. ward_leaders keeps only a non-secret hasPassword flag.
// Migration: a leader whose only hash is the old unsalted SHA-256 ward_leaders.passwordHash is checked against it once;
// on success the password is re-hashed with scrypt into ward_leader_credentials and passwordHash is deleted from
// ward_leaders. Once a scrypt record exists the old field is never trusted again (and is deleted on the next success).
const PW_CRED_COLLECTION = 'ward_leader_credentials';
const PW_SCRYPT = { N: 16384, r: 8, p: 1, keyLen: 64 };
const PW_MIN_LEN = 6;
const PW_MAX_LEN = 200;
const PW_DUMMY_SALT = crypto.randomBytes(16);
const PW_SET_SIGNIN_REQUIRED = 'Sign in with your passkey, a text code or Google first, then set the password again.';
const PW_SET_NOT_ALLOWED = 'This sign-in cannot set a password for that leader.';
const PW_SET_BAD_PASSWORD = `Please use a password of ${PW_MIN_LEN} to ${PW_MAX_LEN} characters.`;
const PW_SET_NO_RECORD = 'No active leader record was found for this sign-in.';

function pwScrypt(password, salt, params) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(String(password), salt, params.keyLen,
      { N: params.N, r: params.r, p: params.p, maxmem: 64 * 1024 * 1024 },
      (err, key) => (err ? reject(err) : resolve(key)));
  });
}

async function pwMakeRecord(password) {
  const salt = crypto.randomBytes(16);
  const key = await pwScrypt(password, salt, PW_SCRYPT);
  return { algo: 'scrypt', N: PW_SCRYPT.N, r: PW_SCRYPT.r, p: PW_SCRYPT.p, keyLen: PW_SCRYPT.keyLen,
    salt: salt.toString('base64'), hash: key.toString('base64') };
}

async function pwVerifyRecord(password, rec) {
  if (!rec || rec.algo !== 'scrypt') return false;
  const salt = Buffer.from(String(rec.salt || ''), 'base64');
  const want = Buffer.from(String(rec.hash || ''), 'base64');
  const N = Number(rec.N), r = Number(rec.r), p = Number(rec.p);
  if (salt.length < 8 || want.length < 32 || want.length > 128) return false;
  if (!Number.isInteger(N) || N < 1024 || N > 1048576 || (N & (N - 1)) !== 0) return false;
  if (!Number.isInteger(r) || r < 1 || r > 32 || !Number.isInteger(p) || p < 1 || p > 16) return false;
  const got = await pwScrypt(password, salt, { N, r, p, keyLen: want.length });
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

// The two forms the hubs have always accepted: as typed, and lower-cased.
async function pwVerifyAnyForm(password, rec) {
  if (await pwVerifyRecord(password, rec)) return true;
  const lower = password.toLowerCase();
  return lower !== password && pwVerifyRecord(lower, rec);
}

async function pwStoreScrypt(leaderId, password, meta) {
  const rec = await pwMakeRecord(password);
  const batch = db.batch();
  batch.set(db.collection(PW_CRED_COLLECTION).doc(leaderId), {
    ...rec, ...meta, updatedAt: PwFieldValue.serverTimestamp()
  });
  batch.set(db.collection(LEADERS_COLLECTION).doc(leaderId), {
    hasPassword: true, passwordHash: PwFieldValue.delete(), passwordUpdatedAt: new Date().toISOString()
  }, { merge: true });
  await batch.commit();
}

async function pwRateBump(ref, limit, expiresAtMs) {
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const n = snap.exists ? Number(snap.data().count || 0) : 0;
    if (n >= limit) return true;
    tx.set(ref, { count: n + 1, expiresAt: PwTimestamp.fromMillis(expiresAtMs) }, { merge: true });
    return false;
  });
}

async function findActiveLeaderByName(leaderName) {
  const normName = normalizeText(leaderName);
  if (!normName) return null;
  const snap = await db.collection(LEADERS_COLLECTION).get();
  for (const d of snap.docs) {
    const data = d.data() || {};
    if (normalizeText(data.displayName) === normName && data.active !== false) {
      return { id: d.id, ...data };
    }
  }
  return null;
}

async function handlePasswordLogin(req, res) {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const leaderName = typeof body.leaderName === 'string' ? body.leaderName.slice(0, 120) : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const requiredRole = typeof body.requiredRole === 'string' ? body.requiredRole : '';
  if (!normalizeText(leaderName) || !password || password.length > 200) {
    res.status(400).json({ error: PW_LOGIN_FAILED, code: 'bad-request' });
    return;
  }
  const t = new Date();
  const bucket = pwHourBucket(t);
  const expiresAtMs = t.getTime() + 2 * 3600 * 1000;
  const ipRef = db.collection(PW_RATE_COLLECTION).doc(pwSha(`ip|${pwClientIp(req)}|${bucket}`));
  const nameRef = db.collection(PW_RATE_COLLECTION).doc(pwSha(`name|${normalizeText(leaderName)}|${bucket}`));
  try {
    if (await pwRateBump(ipRef, PW_RATE_PER_IP_PER_HOUR, expiresAtMs)) {
      res.status(429).json({ error: PW_RATE_LIMITED, code: 'rate-limited' });
      return;
    }
    const nameSnap = await nameRef.get();
    if (nameSnap.exists && Number(nameSnap.data().count || 0) >= PW_FAILS_PER_LEADER_PER_HOUR) {
      res.status(429).json({ error: PW_RATE_LIMITED, code: 'rate-limited' });
      return;
    }
  } catch (e) {
    console.error('password login: rate check failed', (e && (e.code || e.message)) || 'error');
    res.status(503).json({ error: PW_UNAVAILABLE, code: 'unavailable' });
    return;
  }

  const leader = await findActiveLeaderByName(leaderName);
  // passkeyApi 1.4.0: scrypt record first; the old SHA-256 field only when no scrypt record exists (then migrate).
  let cred = null;
  if (leader) {
    const credSnap = await db.collection(PW_CRED_COLLECTION).doc(leader.id).get();
    cred = credSnap.exists ? credSnap.data() : null;
  }
  let pwOk = false;
  let migrateForm = null;
  if (cred && cred.algo === 'scrypt') {
    pwOk = await pwVerifyAnyForm(password, cred);
  } else {
    await pwScrypt(password, PW_DUMMY_SALT, PW_SCRYPT); // same work whether or not a record exists
    // passkeyApi 1.4.1 (functions 1.2.6, Duane 2026-11-23 cleanup item 3): an old SHA-256 hash moved off ward_leaders into
    // ward_leader_credentials as { algo: 'sha256-legacy', legacyHash } is checked the same one-time way, then replaced
    // by scrypt below (pwStoreScrypt overwrites the whole credentials doc).
    const stored = (cred && cred.algo === 'sha256-legacy') ? cred.legacyHash : (leader ? leader.passwordHash : '');
    const okRaw = pwHashMatches(stored, pwSha(password));
    const okLower = pwHashMatches(stored, pwSha(password.toLowerCase()));
    pwOk = okRaw || okLower;
    if (pwOk) migrateForm = okRaw ? password : password.toLowerCase();
  }
  const roleOk = !leader || requiredRole !== 'bishopric' || isBishopricLeader(leader);
  if (pwOk && leader) {
    try {
      if (migrateForm !== null) {
        await pwStoreScrypt(leader.id, migrateForm, { source: 'migrated-sha256' });
      } else if (leader.passwordHash) {
        await db.collection(LEADERS_COLLECTION).doc(leader.id).set({ passwordHash: PwFieldValue.delete(), hasPassword: true }, { merge: true });
      }
    } catch (migErr) {
      console.warn('password login: rehash failed', (migErr && (migErr.code || migErr.message)) || 'error');
    }
  }
  if (!leader || !pwOk || !roleOk) {
    try {
      await nameRef.set({ count: PwFieldValue.increment(1),
        expiresAt: PwTimestamp.fromMillis(expiresAtMs) }, { merge: true });
    } catch (_) { }
    res.status(401).json({ error: PW_LOGIN_FAILED, code: 'login-failed' });
    return;
  }

  let customToken = null;
  try {
    customToken = await admin.auth().createCustomToken(`pw_${leader.id}`, { pw: 1 });
  } catch (tokenErr) {
    console.warn('password login: could not mint custom token:', (tokenErr && tokenErr.code) || 'error');
  }
  if (!customToken) {
    res.status(503).json({ error: PW_UNAVAILABLE, code: 'unavailable' });
    return;
  }
  // passkeyApi 1.4.0: the signed-in leader's own non-secret profile (Home /admin uses it; Bish ignores it).
  res.status(200).json({ ok: true, customToken, profile: {
    id: leader.id,
    displayName: leader.displayName || '',
    email: leader.email || '',
    phoneNumber: leader.phoneNumber || '',
    role: leader.role || 'leader',
    calling: leader.calling || '',
    org: leader.org || '',
    accessAreas: Array.isArray(leader.accessAreas) ? leader.accessAreas : [],
    rcCodes: Array.isArray(leader.rcCodes) ? leader.rcCodes : [],
    active: leader.active !== false
  } });
}

// passkeyApi 1.4.0 (Duane 2026-11-23, #2): POST /password/set { leaderId, password } with a Firebase ID token.
// Allowed callers mirror who may write ward_leaders today, plus the leader themself:
//  - a passkey (custom-token) sign-in whose own ward_leaders record is active with role admin or bishopric (any leader),
//  - the BW_Platform admin claim (v 2, w 1) (any leader),
//  - the leader's own passkey, text-message or Google sign-in (same checks as passkey enrollment, enrollAllowed).
// With no leaderId, a text-message sign-in sets the password of the one active leader whose phone matches it.
// 'pw_' password sessions can never set a password. The password is stored only as salted scrypt (pwStoreScrypt).
async function handlePasswordSet(req, res) {
  const m = /^Bearer\s+(\S+)$/i.exec(String(req.headers.authorization || ''));
  if (!m) {
    res.status(401).json({ error: PW_SET_SIGNIN_REQUIRED, code: 'signin-required' });
    return;
  }
  let token = null;
  try {
    token = await admin.auth().verifyIdToken(m[1], true);
  } catch (e) {
    res.status(401).json({ error: PW_SET_SIGNIN_REQUIRED, code: 'signin-invalid' });
    return;
  }
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const password = typeof body.password === 'string' ? body.password : '';
  if (password.length < PW_MIN_LEN || password.length > PW_MAX_LEN) {
    res.status(400).json({ error: PW_SET_BAD_PASSWORD, code: 'bad-password' });
    return;
  }
  const provider = (token.firebase && token.firebase.sign_in_provider) || '';
  const caller = { uid: token.uid, provider, phone: token.phone_number || '',
    email: typeof token.email === 'string' ? token.email.trim().toLowerCase() : '', emailVerified: token.email_verified === true };
  if (String(caller.uid).startsWith('pw_')) {
    res.status(403).json({ error: PW_SET_NOT_ALLOWED, code: 'not-allowed' });
    return;
  }
  let leaderId = typeof body.leaderId === 'string' ? body.leaderId.trim() : '';
  if (leaderId && !/^[A-Za-z0-9_-]{1,128}$/.test(leaderId)) {
    res.status(400).json({ error: PW_SET_NOT_ALLOWED, code: 'bad-request' });
    return;
  }
  if (!leaderId && provider === 'phone' && /^\+1\d{10}$/.test(caller.phone)) {
    const snap = await db.collection(LEADERS_COLLECTION).where('phoneNumber', 'in', leaderPhoneVariants(caller.phone)).get();
    const active = snap.docs.filter((d) => (d.data() || {}).active !== false);
    if (active.length === 1) leaderId = active[0].id;
  }
  if (!leaderId) {
    res.status(403).json({ error: PW_SET_NO_RECORD, code: 'no-active-record' });
    return;
  }
  const target = await leaderRecordData(leaderId);
  if (!target) {
    res.status(403).json({ error: PW_SET_NO_RECORD, code: 'no-active-record' });
    return;
  }
  let allowed = token.v === 2 && token.w === 1;
  if (!allowed && provider === 'custom') {
    const own = await leaderRecordData(caller.uid);
    allowed = !!own && own.active !== false && ['admin', 'bishopric'].includes(String(own.role || ''));
  }
  if (!allowed) allowed = enrollAllowed(caller, leaderId, target).ok;
  if (!allowed) {
    res.status(403).json({ error: PW_SET_NOT_ALLOWED, code: 'not-allowed' });
    return;
  }
  try {
    await pwStoreScrypt(leaderId, password, { source: 'set', setBy: caller.uid });
  } catch (e) {
    console.error('password set: store failed', (e && (e.code || e.message)) || 'error');
    res.status(503).json({ error: PW_UNAVAILABLE, code: 'unavailable' });
    return;
  }
  res.status(200).json({ ok: true });
}

exports.passkeyApi = onRequest(
  { region: 'us-central1', cors: false },
  async (req, res) => {
    setCorsHeaders(req, res);

    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const origin = req.headers.origin || 'https://blackstoneward.org';
    const route = String(req.path || '/').replace(/\/+$/, '') || '/';

    try {
      if (route === '/register/options') {
        await handleRegisterOptions(req, res, origin);
      } else if (route === '/register/verify') {
        await handleRegisterVerify(req, res);
      } else if (route === '/login/options') {
        await handleLoginOptions(req, res, origin);
      } else if (route === '/login/verify') {
        await handleLoginVerify(req, res);
      } else if (route === '/password/login') {
        await handlePasswordLogin(req, res);
      } else if (route === '/password/set') {
        await handlePasswordSet(req, res);
      } else {
        res.status(404).json({ error: `Unknown passkey endpoint: ${route}` });
      }
    } catch (err) {
      console.error('passkeyApi error:', err);
      res.status(500).json({ error: err?.message || 'Internal passkey server error' });
    }
  }
);

// v1.2.0 (2026-11-22, Duane voice 10:06 PM ET): /td member reschedule + sanitized public view (see td.js).
// Deploy ONLY with: firebase deploy --only functions:tdReschedule,functions:tdPublicSync (never a broader functions
// deploy: BW_Youth's functions share the `default` codebase in this project). Both are LIVE production changes.
const td = require('./td');
exports.tdReschedule = onRequest(
  { region: 'us-central1', cors: false, maxInstances: 5 },
  td.makeHandler({ db, admin, setCorsHeaders, isAllowedOrigin })
);
exports.tdPublicSync = onDocumentWritten(
  { document: 'home_content/{docId}', region: 'us-central1' },
  td.makeSync({ db })
);


// v1.3.0 (2026-11-24, phase 4): email the Ward Clerk when a change request is opened,
// and the requester when it is closed. NOT DEPLOYED until Duane's separate approval.
// Deploy ONLY with: firebase deploy --only functions:changeRequestNotify --project blackstoneward-b861c
// (never a broader functions deploy). Uses the existing mail collection / Trigger Email extension.
const changeRequestNotifyMod = require('./changeRequestNotify');
exports.changeRequestNotify = onDocumentWritten(
  { document: 'change_requests/{requestId}', region: 'us-central1' },
  changeRequestNotifyMod.makeHandler({ db })
);


// v1.4.0 (2026-11-27, Duane go-ahead 10:20 PM ET): Horus, the Handbook + site-help assistant relay for the Bishopric Hub (see handbookAssistant.js).
// Relays a signed-in General Bishopric question to Ollama on the ward Mac mini through Cloudflare Access + Tunnel bw-ai.
// Who may use it: Firestore doc handbook_assistant_config/main (missing = disabled). No prompts/answers are logged or stored.
// Deploy ONLY with: firebase deploy --only functions:handbookAssistant --project blackstoneward-b861c
// (never a broader functions deploy). LIVE production change. Needs Secret Manager CF_ACCESS_CLIENT_ID / CF_ACCESS_CLIENT_SECRET.
const { defineSecret } = require('firebase-functions/params');
const CF_ACCESS_CLIENT_ID = defineSecret('CF_ACCESS_CLIENT_ID');
const CF_ACCESS_CLIENT_SECRET = defineSecret('CF_ACCESS_CLIENT_SECRET');
const handbookAssistantMod = require('./handbookAssistant');
exports.handbookAssistant = onRequest(
  { region: 'us-central1', cors: false, secrets: [CF_ACCESS_CLIENT_ID, CF_ACCESS_CLIENT_SECRET],
    timeoutSeconds: 60, memory: '256MiB', maxInstances: 3, concurrency: 1 },
  handbookAssistantMod.makeHandler({
    db, admin, setCorsHeaders, isAllowedOrigin,
    getSecrets: () => ({ id: CF_ACCESS_CLIENT_ID.value(), secret: CF_ACCESS_CLIENT_SECRET.value() })
  })
);
