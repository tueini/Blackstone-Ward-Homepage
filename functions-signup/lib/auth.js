'use strict';
// Leader sign-in for the signup API. The browser sends its Firebase ID token (passkey custom token, SMS phone
// or Google sign-in from the existing restricted-area sign-in). The server resolves the active ward_leaders record
// with the Admin SDK and derives areas from the vendored permissions.json (Permissions sheet). Fails closed.
const path = require('node:path');
const fs = require('node:fs');
const { HttpError } = require('./util');
const { WARD_ADMIN_SEATS, WARD_ADMIN_ROLES } = require('./orgs');

const PERMISSIONS = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'permissions.json'), 'utf8'));
const AREAS_BY_RC = Object.fromEntries(PERMISSIONS.roles.map((r) => [r.rc, r.areas]));

function phoneVariants(p) {
  if (!/^\+1[0-9]{10}$/.test(p || '')) return [];
  const a = p.slice(2, 5); const b = p.slice(5, 8); const c = p.slice(8, 12); const d = p.slice(2, 12);
  return [p, d, `1${d}`, `(${a}) ${b}-${c}`, `(${a})${b}-${c}`, `${a}-${b}-${c}`, `${a}.${b}.${c}`, `${a} ${b} ${c}`,
    `+1 ${a} ${b} ${c}`, `+1 (${a}) ${b}-${c}`, `+1-${a}-${b}-${c}`, `+1 ${a}-${b}-${c}`, `1-${a}-${b}-${c}`, `1 (${a}) ${b}-${c}`];
}

const isActive = (d) => d && d.active !== false;

function toLeader(id, d) {
  const rcCodes = Array.isArray(d.rcCodes) ? d.rcCodes.filter((x) => typeof x === 'string') : [];
  const areas = new Set();
  rcCodes.forEach((rc) => (AREAS_BY_RC[rc] || []).forEach((a) => areas.add(a)));
  const role = typeof d.role === 'string' ? d.role : '';
  const wardAdmin = rcCodes.some((rc) => WARD_ADMIN_SEATS.includes(rc)) || WARD_ADMIN_ROLES.includes(role);
  return {
    id,
    name: String(d.displayName || d.name || '').trim() || 'Leader',
    email: typeof d.email === 'string' ? d.email.trim().toLowerCase() : '',
    rcCodes, role, areas, wardAdmin,
  };
}

async function resolveLeader({ db, auth }, authHeader) {
  const m = /^Bearer\s+(.+)$/i.exec(String(authHeader || ''));
  if (!m) throw new HttpError(401, 'signin_required', 'Please sign in.');
  let decoded;
  try { decoded = await auth.verifyIdToken(m[1]); } catch (_) { throw new HttpError(401, 'signin_required', 'Your sign-in expired. Please sign in again.'); }
  const provider = (decoded.firebase && decoded.firebase.sign_in_provider) || '';
  const col = db.collection('ward_leaders');
  let found = null;
  if (provider === 'custom') {
    // passkeyApi mints uid = ward_leaders doc id. Password-only sessions (pw_<id>) carry no leader access.
    if (!decoded.uid.startsWith('pw_')) {
      const s = await col.doc(decoded.uid).get();
      if (s.exists && isActive(s.data())) found = toLeader(s.id, s.data());
    }
  } else if (provider === 'phone') {
    const v = phoneVariants(decoded.phone_number);
    if (v.length) {
      const q = await col.where('phoneNumber', 'in', v).get();
      const act = q.docs.filter((d) => isActive(d.data()));
      if (act.length === 1) found = toLeader(act[0].id, act[0].data());
    }
  } else if (provider === 'google.com') {
    if (decoded.email_verified === true && decoded.email) {
      const q = await col.where('email', '==', String(decoded.email).toLowerCase()).get();
      const act = q.docs.filter((d) => isActive(d.data()));
      if (act.length === 1) found = toLeader(act[0].id, act[0].data());
    }
  }
  if (!found) throw new HttpError(403, 'not_leader', 'This sign-in is not linked to an active ward leader.');
  return found;
}

module.exports = { resolveLeader, toLeader, phoneVariants, PERMISSIONS };
