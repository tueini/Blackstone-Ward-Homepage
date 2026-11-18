const crypto = require('node:crypto');
const { onRequest } = require('firebase-functions/v2/https');
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

async function handleRegisterOptions(req, res, origin) {
  const { leaderProfile } = req.body || {};
  const profile = await resolveLeaderProfile(leaderProfile);
  if (!profile || !profile.id) {
    res.status(400).json({ error: 'Valid leader profile is required to register a passkey.' });
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
      } else {
        res.status(404).json({ error: `Unknown passkey endpoint: ${route}` });
      }
    } catch (err) {
      console.error('passkeyApi error:', err);
      res.status(500).json({ error: err?.message || 'Internal passkey server error' });
    }
  }
);
