'use strict';
// Signup Phase 1 (2026-11-25): small helpers. No secrets in this file.
const crypto = require('node:crypto');

class HttpError extends Error {
  constructor(status, code, message) { super(message || code); this.status = status; this.code = code; }
}

const randomToken = (n = 32) => crypto.randomBytes(n).toString('base64url');
const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
function safeEqualHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !/^[0-9a-f]+$/.test(a) || !/^[0-9a-f]+$/.test(b)) return false;
  const x = Buffer.from(a, 'hex'); const y = Buffer.from(b, 'hex');
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}

// Passcodes: scrypt with a per-hash salt. Never stored or logged in clear text.
const SCRYPT = { N: 16384, r: 8, p: 1 };
function hashPasscode(p) {
  const salt = crypto.randomBytes(16);
  const h = crypto.scryptSync(String(p), salt, 32, SCRYPT);
  return `scrypt$${salt.toString('base64url')}$${h.toString('base64url')}`;
}
function verifyPasscode(p, stored) {
  if (typeof stored !== 'string') return false;
  const [alg, s, h] = stored.split('$');
  if (alg !== 'scrypt' || !s || !h) return false;
  const calc = crypto.scryptSync(String(p), Buffer.from(s, 'base64url'), 32, SCRYPT);
  const exp = Buffer.from(h, 'base64url');
  return exp.length === calc.length && crypto.timingSafeEqual(exp, calc);
}

// Signed cookie value: base64url(JSON) + '.' + HMAC-SHA256.
function signCookie(obj, key) {
  const body = Buffer.from(JSON.stringify(obj)).toString('base64url');
  const sig = crypto.createHmac('sha256', key).update(body).digest('base64url');
  return `${body}.${sig}`;
}
function verifyCookie(val, key) {
  if (!val || typeof val !== 'string' || val.length > 4000) return null;
  const i = val.lastIndexOf('.');
  if (i < 1) return null;
  const body = val.slice(0, i); const sig = val.slice(i + 1);
  const exp = crypto.createHmac('sha256', key).update(body).digest('base64url');
  const a = Buffer.from(sig); const b = Buffer.from(exp);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try { return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch (_) { return null; }
}
function parseCookies(header) {
  const out = {};
  String(header || '').split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > 0) { try { out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); } catch (_) { /* ignore bad cookie */ } }
  });
  return out;
}

// ---- input validation ----
const CTRL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
function str(v, { max = 200, min = 0, field = 'Value', multiline = false } = {}) {
  if (v === undefined || v === null) v = '';
  if (typeof v !== 'string') throw new HttpError(400, 'invalid', `${field} must be text.`);
  let s = v.replace(CTRL, '');
  s = multiline ? s.replace(/\r\n/g, '\n').trim() : s.replace(/\s+/g, ' ').trim();
  if (s.length < min) throw new HttpError(400, 'invalid', `${field} is required.`);
  if (s.length > max) throw new HttpError(400, 'invalid', `${field} must be ${max} characters or fewer.`);
  return s;
}
function int(v, { min = 0, max = 1000, field = 'Number' } = {}) {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (!Number.isInteger(n) || n < min || n > max) throw new HttpError(400, 'invalid', `${field} must be a whole number from ${min} to ${max}.`);
  return n;
}
function bool(v) { return v === true || v === 'true' || v === 1; }
function email(v, field = 'Email') {
  const s = str(v, { max: 200, min: 3, field }).toLowerCase();
  if (!/^[^\s@<>()",;:\\]+@[^\s@<>()",;:\\]+\.[a-z]{2,}$/i.test(s)) throw new HttpError(400, 'invalid_email', `Enter a valid ${field.toLowerCase()} address.`);
  return s;
}
function isoDate(v, field, { optional = false } = {}) {
  if (v === undefined || v === null || v === '') {
    if (optional) return null;
    throw new HttpError(400, 'invalid', `${field} is required.`);
  }
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new HttpError(400, 'invalid', `${field} is not a valid date.`);
  return d.toISOString();
}
function httpsUrl(v, field = 'Link') {
  const s = str(v, { max: 1000, min: 1, field });
  let u;
  try { u = new URL(s); } catch (_) { throw new HttpError(400, 'invalid', `${field} must be a full https:// link.`); }
  if (u.protocol !== 'https:') throw new HttpError(400, 'invalid', `${field} must start with https://.`);
  return u.toString();
}
// One name field (placeholder 'Enter First & Last Name (e.g. Mahonri Moriancumer)'): last word = last name.
function splitName(full) {
  const s = str(full, { max: 80, min: 1, field: 'Name' });
  const parts = s.split(' ').filter(Boolean);
  if (parts.length < 2) throw new HttpError(400, 'name_required', 'Enter your first and last name.');
  const last = parts.pop();
  return { first: parts.join(' ').slice(0, 40), last: last.slice(0, 40) };
}
function lastInitial(last) {
  const m = String(last || '').match(/\p{L}/u);
  return m ? m[0].toUpperCase() : '';
}
// Public label: first name + last initial only (never a full last name, never contact info).
function publicName(d) {
  const f = String(d.display_first_name || '').trim();
  const i = String(d.display_last_initial || '').trim();
  return i ? `${f} ${i}.` : f;
}
function slugify(title) {
  const base = String(title || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/g, '') || 'event';
  const suffix = crypto.randomBytes(4).readUInt32BE(0).toString(36).slice(0, 5).padStart(5, '0');
  return `${base}-${suffix}`;
}
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function csvCell(v) {
  let s = v === undefined || v === null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // spreadsheet formula injection guard
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

module.exports = {
  HttpError, randomToken, sha256, safeEqualHex, hashPasscode, verifyPasscode, signCookie, verifyCookie, parseCookies,
  str, int, bool, email, isoDate, httpsUrl, splitName, lastInitial, publicName, slugify, esc, csvCell,
};
