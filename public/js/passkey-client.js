export const PASSKEY_API_BASE = 'https://us-central1-blackstoneward-b861c.cloudfunctions.net/passkeyApi';

export function bufferToBase64url(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function base64urlToBuffer(base64url) {
  const str = String(base64url || '').replace(/-/g, '+').replace(/_/g, '/');
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4));
  const binary = atob(str + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function postPasskeyJson(route, body, idToken = '') {
  // passkeyApi 1.1.0 (2026-11-22): enrollment calls carry the signed-in leader's Firebase ID token; login calls do not.
  const headers = { 'Content-Type': 'application/json' };
  if (idToken) headers.Authorization = `Bearer ${idToken}`;
  const res = await fetch(`${PASSKEY_API_BASE}${route}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body || {})
  });
  let data = null;
  try {
    data = await res.json();
  } catch (_) {
    data = null;
  }
  if (!res.ok) {
    const err = new Error(data?.error || `Passkey request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

// passkeyApi 1.1.0 (2026-11-22): adding a passkey needs a Firebase sign-in (text code or passkey) for this leader.
export const PASSKEY_SIGNIN_REQUIRED_MSG = "Sign in by text message first to add a passkey. Password sign-ins can't add one.";
export async function enrollCloudPasskey(leaderProfile, { idToken = '' } = {}) {
  if (!idToken) {
    const err = new Error(PASSKEY_SIGNIN_REQUIRED_MSG);
    err.code = 'passkey/signin-required';
    throw err;
  }
  const { challengeId, options } = await postPasskeyJson('/register/options', { leaderProfile }, idToken);

  const publicKey = {
    ...options,
    challenge: base64urlToBuffer(options.challenge),
    user: {
      ...options.user,
      id: base64urlToBuffer(options.user.id)
    },
    excludeCredentials: Array.isArray(options.excludeCredentials)
      ? options.excludeCredentials.map((cred) => ({
          ...cred,
          type: cred.type || 'public-key',
          id: base64urlToBuffer(cred.id)
        }))
      : []
  };

  const credential = await navigator.credentials.create({ publicKey });
  if (!credential) {
    throw new Error('Passkey creation was cancelled.');
  }

  const attestationResponse = {
    id: credential.id,
    rawId: bufferToBase64url(credential.rawId),
    type: credential.type,
    authenticatorAttachment: credential.authenticatorAttachment || undefined,
    response: {
      clientDataJSON: bufferToBase64url(credential.response.clientDataJSON),
      attestationObject: bufferToBase64url(credential.response.attestationObject),
      transports: typeof credential.response.getTransports === 'function'
        ? credential.response.getTransports()
        : undefined
    },
    clientExtensionResults: typeof credential.getClientExtensionResults === 'function'
      ? credential.getClientExtensionResults()
      : {}
  };

  return postPasskeyJson('/register/verify', { challengeId, attestationResponse }, idToken);
}

// v1.2.91 (passkeyApi 1.4.0, Duane 2026-11-23, #2): personal leader passwords are checked and stored only on the server
// (salted scrypt in a collection no browser can read). The browser sends the typed password to the server and never
// hashes or compares it. /password/login returns { ok, customToken, profile }; /password/set needs a Firebase ID token.
export async function loginWithLeaderPassword({ leaderName = '', password = '', requiredRole = '' } = {}) {
  return postPasskeyJson('/password/login', { leaderName, password, requiredRole });
}

export async function setLeaderPassword({ leaderId = '', password = '' } = {}, idToken = '') {
  return postPasskeyJson('/password/set', { leaderId, password }, idToken);
}

export async function loginWithCloudPasskey({ leaderName = '', requiredRole = '', signal = undefined, mediation = undefined } = {}) {
  const { challengeId, options } = await postPasskeyJson('/login/options', {
    leaderName,
    requiredRole
  });

  const publicKey = {
    ...options,
    challenge: base64urlToBuffer(options.challenge),
    allowCredentials: Array.isArray(options.allowCredentials)
      ? options.allowCredentials.map((cred) => ({
          ...cred,
          type: cred.type || 'public-key',
          id: base64urlToBuffer(cred.id)
        }))
      : undefined
  };

  const getOpts = { publicKey };
  if (signal) getOpts.signal = signal;
  if (mediation) getOpts.mediation = mediation;

  const assertion = await navigator.credentials.get(getOpts);
  if (!assertion) {
    throw new Error('Passkey verification was cancelled.');
  }

  const assertionResponse = {
    id: assertion.id,
    rawId: bufferToBase64url(assertion.rawId),
    type: assertion.type,
    authenticatorAttachment: assertion.authenticatorAttachment || undefined,
    response: {
      clientDataJSON: bufferToBase64url(assertion.response.clientDataJSON),
      authenticatorData: bufferToBase64url(assertion.response.authenticatorData),
      signature: bufferToBase64url(assertion.response.signature),
      userHandle: assertion.response.userHandle
        ? bufferToBase64url(assertion.response.userHandle)
        : undefined
    },
    clientExtensionResults: typeof assertion.getClientExtensionResults === 'function'
      ? assertion.getClientExtensionResults()
      : {}
  };

  return postPasskeyJson('/login/verify', {
    challengeId,
    assertionResponse,
    requiredRole
  });
}
