'use strict';
// Blackstone Ward sign-up / RSVP API (Signup Phase 1, 2026-11-25). Codebase 'signup'.
// Every signup_* collection is server-only: browsers never read or write them directly (see the BW_Platform rules
// draft). Participants have no accounts: access is a public link, a shared passcode (signed httpOnly cookie) or a
// personal invite token; edits use a personal magic link. Tokens and passcodes are stored only as hashes.
const crypto = require('node:crypto');
const U = require('./util');
const { HttpError } = U;
const { ORGS, ORG_BY_ID, AREA_TOOLS, AREA_CONTACTS } = require('./orgs');
const { resolveLeader } = require('./auth');
const { STARTER_TEMPLATES } = require('./templates');
const M = require('./mail');

const C = {
  EVENTS: 'signup_events', SLOTS: 'signup_slots', SIGNUPS: 'signup_signups', RSVPS: 'signup_rsvps',
  INVITES: 'signup_invites', TEMPLATES: 'signup_templates', ORGS: 'signup_orgs', ASSIGN: 'signup_leader_org_assignments',
  COORG: 'signup_event_co_organizers', RATE: 'signup_ratelimits', CONFIG: 'signup_config',
};
const TYPES = ['slots', 'rsvp', 'slots_plus_rsvp'];
const LEVELS = ['public', 'passcode', 'invite_only'];
const STATUSES = ['draft', 'published', 'closed'];
const DAY = 86400000;
const GRACE_DAYS = 7;            // edit / invite tokens: event end + 7 days
const COOKIE_NAME = '__session'; // the only cookie Firebase Hosting forwards to a function
const COOKIE_MAX_DAYS = 30;      // remembered passcode: event end or 30 days, whichever is first
const DEFAULT_RETENTION_DAYS = 60;
const RL = {
  passcode: { limit: 5, windowSec: 15 * 60 },
  submit: { limit: 10, windowSec: 10 * 60 },
  token: { limit: 30, windowSec: 10 * 60 },
};
const ALLOWED_ORIGINS = new Set([
  'https://blackstoneward.org', 'https://www.blackstoneward.org', 'https://test.blackstoneward.org',
  'https://blackstoneward-b861c.web.app', 'https://blackstoneward-b861c.firebaseapp.com',
  'https://test-blackstoneward.web.app', 'https://test-blackstoneward.firebaseapp.com',
]);
const hasRsvp = (t) => t === 'rsvp' || t === 'slots_plus_rsvp';
const hasSlots = (t) => t === 'slots' || t === 'slots_plus_rsvp';
const ms = (iso) => (iso ? Date.parse(iso) : NaN);

function createApp({ db, auth, mailer, now = () => new Date(), emulator = process.env.FUNCTIONS_EMULATOR === 'true' }) {
  const nowMs = () => now().getTime();
  let keysCache = null;

  // ---------- infrastructure ----------
  async function keys() {
    if (keysCache) return keysCache;
    const ref = db.collection(C.CONFIG).doc('keys');
    const data = await db.runTransaction(async (tx) => {
      const s = await tx.get(ref);
      if (s.exists && s.data().cookie_key) return s.data();
      const d = { cookie_key: crypto.randomBytes(32).toString('base64'), ip_salt: crypto.randomBytes(16).toString('base64'), created_at: new Date(nowMs()).toISOString() };
      tx.set(ref, d);
      return d;
    });
    keysCache = { cookie: Buffer.from(data.cookie_key, 'base64'), ipSalt: data.ip_salt };
    return keysCache;
  }
  async function settings() {
    const s = await db.collection(C.CONFIG).doc('settings').get();
    const d = s.exists ? s.data() : {};
    const r = Number.isInteger(d.retention_days) ? Math.min(90, Math.max(30, d.retention_days)) : DEFAULT_RETENTION_DAYS;
    return { retention_days: r };
  }
  function clientIp(req) {
    const h = req.headers || {};
    return String(h['fastly-client-ip'] || String(h['x-forwarded-for'] || '').split(',')[0] || req.ip || 'unknown').trim();
  }
  // Fixed-window limiter. Doc id = hash(salted ip + bucket); the raw IP is never stored.
  async function rateLimit(req, bucket, extra = '') {
    const cfg = RL[bucket];
    const k = await keys();
    const id = U.sha256(`${k.ipSalt}|${bucket}|${extra}|${clientIp(req)}`);
    const ref = db.collection(C.RATE).doc(id);
    const t = nowMs();
    const ok = await db.runTransaction(async (tx) => {
      const s = await tx.get(ref);
      let d = s.exists ? s.data() : null;
      if (!d || t - d.window_start >= cfg.windowSec * 1000) d = { window_start: t, count: 0 };
      d.count += 1;
      d.expires_at = d.window_start + cfg.windowSec * 1000;
      tx.set(ref, d);
      return d.count <= cfg.limit;
    });
    if (!ok) throw new HttpError(429, 'rate_limited', 'Too many tries. Please wait a few minutes and try again.');
  }
  function linkOrigin(req) {
    const o = (req.headers || {}).origin;
    return o && ALLOWED_ORIGINS.has(o) ? o : 'https://blackstoneward.org';
  }
  async function sendSafe(msg) {
    try { await mailer(msg); return true; } catch (e) { console.error('signup mail failed:', e && e.message ? e.message : 'error'); return false; }
  }
  async function ensureSeeds() {
    for (const t of STARTER_TEMPLATES) {
      const ref = db.collection(C.TEMPLATES).doc(t.id);
      const s = await ref.get();
      if (!s.exists) await ref.set({ ...t, created_by: 'system', created_at: new Date(nowMs()).toISOString() });
    }
  }
  async function getOrgDoc(orgId) {
    const cfg = ORG_BY_ID[orgId];
    if (!cfg) throw new HttpError(400, 'bad_org', 'Unknown organization.');
    const s = await db.collection(C.ORGS).doc(orgId).get();
    const d = s.exists ? s.data() : {};
    return { ...cfg, default_passcode_hash: d.default_passcode_hash || null, passcode_version: d.passcode_version || 0, passcode_updated_at: d.passcode_updated_at || null };
  }

  // ---------- event helpers ----------
  async function loadEvent(slug, tx) {
    const id = U.str(slug, { max: 80, min: 1, field: 'Event' });
    if (!/^[a-z0-9-]+$/.test(id)) throw new HttpError(404, 'not_found', 'This sign-up was not found.');
    const ref = db.collection(C.EVENTS).doc(id);
    const s = tx ? await tx.get(ref) : await ref.get();
    if (!s.exists) throw new HttpError(404, 'not_found', 'This sign-up was not found.');
    return { ref, ev: { id: s.id, ...s.data() } };
  }
  async function loadSlots(eventId, tx) {
    const q = db.collection(C.SLOTS).where('event_id', '==', eventId);
    const s = tx ? await tx.get(q) : await q.get();
    return s.docs.map((d) => ({ id: d.id, ref: d.ref, ...d.data() })).sort((a, b) => (a.sort || 0) - (b.sort || 0));
  }
  function isOpen(ev, t = nowMs()) {
    if (ev.status !== 'published' || ev.purged_at) return false;
    if (ev.close_at && ms(ev.close_at) <= t) return false;
    if (ev.ends_at && ms(ev.ends_at) <= t) return false;
    return true;
  }
  const tokenExpiry = (ev) => (ev.ends_at ? ms(ev.ends_at) : nowMs() + 90 * DAY) + GRACE_DAYS * DAY;
  const counts = (ev) => ({ yes: 0, no: 0, maybe: 0, yes_headcount: 0, ...(ev.rsvp_counts || {}) });

  async function publicView(ev, slots) {
    const view = {
      slug: ev.id, org_id: ev.org_id, title: ev.title, description: ev.description || '', location: ev.location || '',
      starts_at: ev.starts_at || null, ends_at: ev.ends_at || null, close_at: ev.close_at || null, type: ev.type,
      status: ev.status, open: isOpen(ev), ended: !!ev.purged_at, access_level: ev.access_level, hide_names: !!ev.hide_names,
      noindex: ev.access_level !== 'public' ? true : ev.noindex !== false,
      allow_guests: !!ev.allow_guests, guest_cap: ev.allow_guests ? (ev.guest_cap || 0) : 0,
      organizer_name: ev.organizer_name || '',
      assets: (ev.assets || []).filter((a) => a.kind !== 'image' || a.consent === true).map((a) => ({ kind: a.kind, url: a.url, filename: a.filename || '', caption: a.caption || '' })),
      slots: [], rsvp: null,
    };
    let signups = []; let rsvps = [];
    if (!ev.hide_names && !ev.purged_at) {
      const [a, b] = await Promise.all([
        hasSlots(ev.type) ? db.collection(C.SIGNUPS).where('event_id', '==', ev.id).where('canceled_at', '==', null).get() : null,
        hasRsvp(ev.type) ? db.collection(C.RSVPS).where('event_id', '==', ev.id).where('canceled_at', '==', null).get() : null,
      ]);
      signups = a ? a.docs.map((d) => d.data()) : [];
      rsvps = b ? b.docs.map((d) => d.data()) : [];
    }
    if (hasSlots(ev.type)) {
      view.slots = slots.map((s) => ({
        id: s.id, title: s.title, help_comment: s.help_comment || '', quantity_wanted: s.quantity_wanted,
        filled: s.filled || 0, remaining: Math.max(0, s.quantity_wanted - (s.filled || 0)),
        names: ev.hide_names ? [] : signups.filter((x) => x.slot_id === s.id).map((x) => ({ name: U.publicName(x), quantity: x.quantity })),
      }));
    }
    if (hasRsvp(ev.type)) {
      const c = counts(ev);
      view.rsvp = {
        headcount_cap: ev.headcount_cap || 0, yes_headcount: c.yes_headcount,
        remaining: Math.max(0, (ev.headcount_cap || 0) - c.yes_headcount), yes: c.yes, maybe: c.maybe, no: c.no,
        names: ev.hide_names ? [] : rsvps.filter((r) => r.response === 'yes').map((r) => ({ name: U.publicName(r), headcount: r.adult_count + r.guest_count })),
      };
    }
    return view;
  }

  // ---------- participant access ----------
  async function readGrants(req) {
    const raw = U.parseCookies((req.headers || {}).cookie)[COOKIE_NAME];
    const k = await keys();
    const v = U.verifyCookie(raw, k.cookie);
    return v && v.g && typeof v.g === 'object' ? v.g : {};
  }
  async function passcodeTarget(ev) {
    if (ev.passcode_hash) return { key: `e:${ev.id}`, hash: ev.passcode_hash, version: ev.passcode_version || 0 };
    const org = await getOrgDoc(ev.org_id);
    if (org.default_passcode_hash) return { key: `o:${ev.org_id}`, hash: org.default_passcode_hash, version: org.passcode_version || 0 };
    return null;
  }
  function parseToken(tok, prefix) {
    const parts = String(tok || '').split('.');
    if (parts.length !== 3 || parts[0] !== prefix || !/^[A-Za-z0-9_-]{1,80}$/.test(parts[1]) || !/^[A-Za-z0-9_-]{20,100}$/.test(parts[2])) return null;
    return { id: parts[1], secret: parts[2] };
  }
  async function checkInvite(ev, token) {
    const p = parseToken(token, 'i');
    if (!p) return null;
    const s = await db.collection(C.INVITES).doc(p.id).get();
    if (!s.exists) return null;
    const inv = { id: s.id, ...s.data() };
    if (inv.event_id !== ev.id || inv.revoked_at || !(inv.expires_at > nowMs())) return null;
    if (!U.safeEqualHex(U.sha256(p.secret), inv.token_hash)) return null;
    return inv;
  }
  // Returns { invite } or throws 403 with needs = passcode | invite.
  async function requireAccess(req, ev, body) {
    if (ev.status === 'draft') throw new HttpError(404, 'not_found', 'This sign-up was not found.');
    if (ev.access_level === 'public') return { invite: null };
    if (ev.access_level === 'invite_only') {
      const inv = await checkInvite(ev, body.invite);
      if (!inv) {
        if (body.invite) await rateLimit(req, 'token');
        const e = new HttpError(403, 'invite_required', 'This sign-up is by invitation only. Please use the personal link in your invitation email.');
        e.needs = 'invite'; throw e;
      }
      return { invite: inv };
    }
    const target = await passcodeTarget(ev);
    const g = await readGrants(req);
    const grant = target && g[target.key];
    if (!target || !grant || grant.v !== target.version || !(grant.exp > nowMs())) {
      const e = new HttpError(403, 'passcode_required', target ? 'Enter the passcode for this sign-up.' : 'This sign-up is not open yet.');
      e.needs = 'passcode'; throw e;
    }
    return { invite: null };
  }

  // ---------- public routes ----------
  async function pubEvent({ req, body }) {
    const { ev } = await loadEvent(body.slug);
    await requireAccess(req, ev, body);
    return { event: await publicView(ev, await loadSlots(ev.id)) };
  }

  async function pubPasscode({ req, res, body }) {
    const { ev } = await loadEvent(body.slug);
    if (ev.status === 'draft' || ev.access_level !== 'passcode') throw new HttpError(404, 'not_found', 'This sign-up was not found.');
    await rateLimit(req, 'passcode', ev.id);
    const pass = U.str(body.passcode, { max: 64, min: 1, field: 'Passcode' });
    const target = await passcodeTarget(ev);
    if (!target || !U.verifyPasscode(pass, target.hash)) throw new HttpError(403, 'wrong_passcode', 'That passcode is not right. Please check with the organizer.');
    const t = nowMs();
    const g = await readGrants(req);
    Object.keys(g).forEach((k) => { if (!(g[k] && g[k].exp > t)) delete g[k]; });
    const exp = Math.min(ev.ends_at ? ms(ev.ends_at) + DAY : t + COOKIE_MAX_DAYS * DAY, t + COOKIE_MAX_DAYS * DAY);
    g[target.key] = { v: target.version, exp };
    const keep = Object.entries(g).sort((a, b) => b[1].exp - a[1].exp).slice(0, 20);
    const grants = Object.fromEntries(keep);
    const maxAge = Math.max(60, Math.floor((Math.max(...keep.map(([, x]) => x.exp)) - t) / 1000));
    const k = await keys();
    res.setHeader('Set-Cookie', `${COOKIE_NAME}=${encodeURIComponent(U.signCookie({ g: grants }, k.cookie))}; Max-Age=${maxAge}; Path=/; HttpOnly; Secure; SameSite=Lax`);
    return { event: await publicView(ev, await loadSlots(ev.id)) };
  }

  function readParticipant(body) {
    const { first, last } = U.splitName(body.name);
    return {
      display_first_name: first, display_last_initial: U.lastInitial(last), legal_last_name: last,
      contact_email: U.email(body.email), is_youth: U.bool(body.is_youth),
      comment: U.str(body.comment, { max: 500, field: 'Comment', multiline: true }),
    };
  }
  function readItems(raw, slotsById, { allowZero = false } = {}) {
    if (raw === undefined || raw === null) return [];
    if (!Array.isArray(raw) || raw.length > 50) throw new HttpError(400, 'invalid', 'Too many items.');
    const seen = new Set(); const out = [];
    for (const it of raw) {
      const slot = slotsById[it && it.slot_id];
      if (!slot) throw new HttpError(400, 'bad_slot', 'One of the items is no longer on this sign-up. Please reload.');
      if (seen.has(slot.id)) throw new HttpError(400, 'invalid', 'Each item can be listed once.');
      seen.add(slot.id);
      const q = U.int(it.quantity, { min: allowZero ? 0 : 1, max: 500, field: `Quantity for ${slot.title}` });
      if (q > 0 || allowZero) out.push({ slot, quantity: q });
    }
    return out;
  }
  function readRsvp(raw, ev) {
    if (!raw) return null;
    const response = raw.response;
    if (!['yes', 'no', 'maybe'].includes(response)) throw new HttpError(400, 'invalid', 'Choose Yes, No or Maybe.');
    if (response === 'no') return { response, adult_count: 0, guest_count: 0 };
    if (!ev.allow_guests && raw.guest_count) throw new HttpError(400, 'no_guests', 'Guests are not allowed for this event.');
    const adult_count = U.int(raw.adult_count, { min: 1, max: 20, field: 'People in your family' });
    const guest_count = ev.allow_guests ? U.int(raw.guest_count || 0, { min: 0, max: ev.guest_cap || 0, field: 'Guests' }) : 0;
    return { response, adult_count, guest_count };
  }
  const headOf = (r) => (r && r.response === 'yes' && !r.canceled_at ? r.adult_count + r.guest_count : 0);
  function applyCount(c, r, sign) {
    if (!r || r.canceled_at) return;
    c[r.response] = Math.max(0, (c[r.response] || 0) + sign);
    c.yes_headcount = Math.max(0, c.yes_headcount + sign * headOf(r));
  }
  const personFields = (p) => ({
    display_first_name: p.display_first_name, display_last_initial: p.display_last_initial, legal_last_name: p.legal_last_name,
    contact_email: p.contact_email, is_youth: !!p.is_youth, invite_id: p.invite_id || null,
    edit_token_hash: p.edit_token_hash, edit_token_expires_at: p.edit_token_expires_at,
  });

  async function pubSubmit({ req, body }) {
    if (typeof body.website === 'string' && body.website.trim() !== '') {
      // Honeypot: bots fill the hidden field. Pretend success; store nothing.
      return { submitted: true, check_email: true };
    }
    await rateLimit(req, 'submit');
    const pre = await loadEvent(body.slug);
    const access = await requireAccess(req, pre.ev, body);
    const person = readParticipant(body);
    const token = `e.${pre.ev.id}.${U.randomToken(32)}`;
    const tokenHash = U.sha256(token.split('.')[2]);
    const t = nowMs(); const nowIso = new Date(t).toISOString();
    const result = await db.runTransaction(async (tx) => {
      const { ref: evRef, ev } = await loadEvent(body.slug, tx);
      if (!isOpen(ev, t)) throw new HttpError(409, 'closed', 'This sign-up is closed.');
      const slots = hasSlots(ev.type) ? await loadSlots(ev.id, tx) : [];
      const byId = Object.fromEntries(slots.map((s) => [s.id, s]));
      const items = hasSlots(ev.type) ? readItems(body.items, byId) : [];
      const rsvp = hasRsvp(ev.type) ? readRsvp(body.rsvp, ev) : null;
      if (!items.length && !rsvp) throw new HttpError(400, 'nothing', hasRsvp(ev.type) ? 'Choose an RSVP or an item to sign up for.' : 'Choose at least one item.');
      if (rsvp) {
        const dup = await tx.get(db.collection(C.RSVPS).where('event_id', '==', ev.id).where('contact_email', '==', person.contact_email).where('canceled_at', '==', null).limit(1));
        if (!dup.empty) throw new HttpError(409, 'already_rsvped', 'You already responded with this email. Use the link in your confirmation email to change it.');
      }
      for (const it of items) {
        const left = it.slot.quantity_wanted - (it.slot.filled || 0);
        if (it.quantity > left) throw new HttpError(409, 'slot_full', left > 0 ? `Only ${left} left for ${it.slot.title}.` : `${it.slot.title} is full.`);
      }
      const c = counts(ev);
      if (rsvp && rsvp.response === 'yes' && c.yes_headcount + headOf(rsvp) > (ev.headcount_cap || 0)) {
        const left = Math.max(0, (ev.headcount_cap || 0) - c.yes_headcount);
        throw new HttpError(409, 'headcount_full', left > 0 ? `Only ${left} spot${left === 1 ? '' : 's'} left (your family and guests count).` : 'This event is full.');
      }
      const base = { event_id: ev.id, org_id: ev.org_id, ...personFields({ ...person, invite_id: access.invite ? access.invite.id : null, edit_token_hash: tokenHash, edit_token_expires_at: tokenExpiry(ev) }), comment: person.comment, created_at: nowIso, updated_at: nowIso, canceled_at: null };
      for (const it of items) {
        tx.set(db.collection(C.SIGNUPS).doc(), { ...base, slot_id: it.slot.id, slot_title: it.slot.title, quantity: it.quantity });
        tx.update(it.slot.ref, { filled: (it.slot.filled || 0) + it.quantity });
      }
      if (rsvp) {
        tx.set(db.collection(C.RSVPS).doc(), { ...base, ...rsvp });
        applyCount(c, rsvp, +1);
        tx.update(evRef, { rsvp_counts: c });
      }
      if (access.invite) tx.update(db.collection(C.INVITES).doc(access.invite.id), { used_at: access.invite.used_at || nowIso });
      return { ev, items: items.map((i) => ({ title: i.slot.title, quantity: i.quantity })), rsvp };
    });
    const link = `${linkOrigin(req)}/signup/${result.ev.id}#edit=${token}`;
    const sent = await sendSafe(M.confirmationEmail({ ev: result.ev, to: person.contact_email, firstName: person.display_first_name, items: result.items, rsvp: result.rsvp, link, replyTo: result.ev.organizer_email || undefined }));
    return { submitted: true, check_email: true, email_sent: sent };
  }

  async function findMine(token, tx) {
    const p = parseToken(token, 'e');
    if (!p) throw new HttpError(403, 'bad_link', 'This link is not valid. Please use the link in your most recent confirmation email.');
    const h = U.sha256(p.secret);
    const get = (q) => (tx ? tx.get(q) : q.get());
    const a = await get(db.collection(C.SIGNUPS).where('event_id', '==', p.id).where('edit_token_hash', '==', h));
    const b = await get(db.collection(C.RSVPS).where('event_id', '==', p.id).where('edit_token_hash', '==', h));
    const all = [...a.docs, ...b.docs];
    if (!all.length) throw new HttpError(403, 'bad_link', 'This link is not valid, or the sign-up was removed by the organizer.');
    const first = all[0].data();
    if (!(first.edit_token_expires_at > nowMs())) throw new HttpError(403, 'link_expired', 'This link has expired.');
    return {
      slug: p.id,
      signups: a.docs.filter((d) => !d.data().canceled_at).map((d) => ({ id: d.id, ref: d.ref, ...d.data() })),
      rsvp: b.docs.filter((d) => !d.data().canceled_at).map((d) => ({ id: d.id, ref: d.ref, ...d.data() }))[0] || null,
      person: first,
    };
  }
  const mineView = (m) => ({
    name: `${m.person.display_first_name} ${m.person.legal_last_name}`, email: m.person.contact_email, comment: m.person.comment || '', is_youth: !!m.person.is_youth,
    items: m.signups.map((s) => ({ slot_id: s.slot_id, title: s.slot_title, quantity: s.quantity })),
    rsvp: m.rsvp ? { response: m.rsvp.response, adult_count: m.rsvp.adult_count, guest_count: m.rsvp.guest_count } : null,
    canceled: !m.signups.length && !m.rsvp,
  });

  async function pubManage({ req, body }) {
    await rateLimit(req, 'token');
    const m = await findMine(body.token);
    const { ev } = await loadEvent(m.slug);
    return { event: await publicView(ev, await loadSlots(ev.id)), mine: mineView(m) };
  }

  async function pubManageUpdate({ req, body }) {
    await rateLimit(req, 'token');
    const t = nowMs(); const nowIso = new Date(t).toISOString();
    const out = await db.runTransaction(async (tx) => {
      const m = await findMine(body.token, tx);
      const { ref: evRef, ev } = await loadEvent(m.slug, tx);
      if (!isOpen(ev, t)) throw new HttpError(409, 'closed', 'This sign-up is closed, so changes are no longer possible.');
      const slots = hasSlots(ev.type) ? await loadSlots(ev.id, tx) : [];
      const byId = Object.fromEntries(slots.map((s) => [s.id, s]));
      const want = hasSlots(ev.type) ? readItems(body.items, byId, { allowZero: true }) : [];
      const comment = body.comment === undefined ? (m.person.comment || '') : U.str(body.comment, { max: 500, field: 'Comment', multiline: true });
      const mineBySlot = Object.fromEntries(m.signups.map((s) => [s.slot_id, s]));
      const writes = [];
      for (const w of want) {
        const cur = mineBySlot[w.slot.id];
        const delta = w.quantity - (cur ? cur.quantity : 0);
        const left = w.slot.quantity_wanted - (w.slot.filled || 0);
        if (delta > 0 && delta > left) throw new HttpError(409, 'slot_full', left > 0 ? `Only ${left} more available for ${w.slot.title}.` : `${w.slot.title} is full.`);
        writes.push({ w, cur, delta });
      }
      let newRsvp = m.rsvp ? { response: m.rsvp.response, adult_count: m.rsvp.adult_count, guest_count: m.rsvp.guest_count } : null;
      const rsvpChange = hasRsvp(ev.type) && body.rsvp !== undefined;
      if (rsvpChange) newRsvp = body.rsvp ? readRsvp(body.rsvp, ev) : null;
      const c = counts(ev);
      if (rsvpChange && headOf(newRsvp) > headOf(m.rsvp) && c.yes_headcount - headOf(m.rsvp) + headOf(newRsvp) > (ev.headcount_cap || 0)) {
        throw new HttpError(409, 'headcount_full', 'There is not enough room for that many people.');
      }
      const pf = personFields(m.person);
      for (const { w, cur, delta } of writes) {
        if (delta !== 0) tx.update(w.slot.ref, { filled: Math.max(0, (w.slot.filled || 0) + delta) });
        if (cur && w.quantity === 0) tx.update(cur.ref, { canceled_at: nowIso, updated_at: nowIso });
        else if (cur) tx.update(cur.ref, { quantity: w.quantity, comment, updated_at: nowIso });
        else if (w.quantity > 0) {
          tx.set(db.collection(C.SIGNUPS).doc(), { event_id: ev.id, org_id: ev.org_id, ...pf, comment, slot_id: w.slot.id, slot_title: w.slot.title, quantity: w.quantity, created_at: nowIso, updated_at: nowIso, canceled_at: null });
        }
      }
      if (rsvpChange) {
        applyCount(c, m.rsvp, -1);
        if (m.rsvp && newRsvp) tx.update(m.rsvp.ref, { ...newRsvp, comment, updated_at: nowIso });
        else if (m.rsvp && !newRsvp) tx.update(m.rsvp.ref, { canceled_at: nowIso, updated_at: nowIso });
        else if (!m.rsvp && newRsvp) tx.set(db.collection(C.RSVPS).doc(), { event_id: ev.id, org_id: ev.org_id, ...pf, comment, ...newRsvp, created_at: nowIso, updated_at: nowIso, canceled_at: null });
        if (newRsvp) applyCount(c, newRsvp, +1);
        tx.update(evRef, { rsvp_counts: c });
      } else if (m.rsvp && comment !== (m.rsvp.comment || '')) tx.update(m.rsvp.ref, { comment, updated_at: nowIso });
      const items = [];
      for (const s of m.signups) { const w = want.find((x) => x.slot.id === s.slot_id); if (!w) items.push({ title: s.slot_title, quantity: s.quantity }); }
      writes.filter((x) => x.w.quantity > 0).forEach((x) => items.push({ title: x.w.slot.title, quantity: x.w.quantity }));
      return { ev, items, rsvp: newRsvp, person: m.person };
    });
    const link = `${linkOrigin(req)}/signup/${out.ev.id}#edit=${body.token}`;
    await sendSafe(M.confirmationEmail({ ev: out.ev, to: out.person.contact_email, firstName: out.person.display_first_name, items: out.items, rsvp: out.rsvp, link, replyTo: out.ev.organizer_email || undefined, changed: true }));
    return { updated: true };
  }

  // Cancels entries and frees their slots / headcount. All reads happen before writes (transaction rule).
  async function cancelEntries(tx, ev, evRef, signups, rsvp, nowIso, extra = {}) {
    const perSlot = {};
    for (const s of signups) perSlot[s.slot_id] = (perSlot[s.slot_id] || 0) + s.quantity;
    const slotSnaps = [];
    for (const id of Object.keys(perSlot)) slotSnaps.push(await tx.get(db.collection(C.SLOTS).doc(id)));
    const c = counts(ev);
    if (rsvp) applyCount(c, rsvp, -1);
    slotSnaps.forEach((s) => { if (s.exists) tx.update(s.ref, { filled: Math.max(0, (s.data().filled || 0) - perSlot[s.id]) }); });
    signups.forEach((s) => tx.update(s.ref, { canceled_at: nowIso, updated_at: nowIso, ...extra }));
    if (rsvp) { tx.update(rsvp.ref, { canceled_at: nowIso, updated_at: nowIso, ...extra }); tx.update(evRef, { rsvp_counts: c }); }
  }

  async function pubManageCancel({ req, body }) {
    await rateLimit(req, 'token');
    const t = nowMs(); const nowIso = new Date(t).toISOString();
    const out = await db.runTransaction(async (tx) => {
      const m = await findMine(body.token, tx);
      const { ref: evRef, ev } = await loadEvent(m.slug, tx);
      if (!isOpen(ev, t)) throw new HttpError(409, 'closed', 'This sign-up is closed, so changes are no longer possible.');
      await cancelEntries(tx, ev, evRef, m.signups, m.rsvp, nowIso);
      return { ev, person: m.person };
    });
    await sendSafe(M.cancelEmail({ ev: out.ev, to: out.person.contact_email, firstName: out.person.display_first_name, replyTo: out.ev.organizer_email || undefined }));
    return { canceled: true };
  }

  // ---------- leader access ----------
  async function leaderOf(ctx) {
    if (!ctx.leader) ctx.leader = await resolveLeader({ db, auth }, (ctx.req.headers || {}).authorization);
    return ctx.leader;
  }
  async function assignmentsOf(leader) {
    const s = await db.collection(C.ASSIGN).where('user_id', '==', leader.id).get();
    return Object.fromEntries(s.docs.map((d) => [d.data().org_id, d.data().role]));
  }
  // Org role: ward_admin | leader (seat or assignment) | co_organizer (assignment). Disabled orgs: ward admins only.
  async function orgRole(leader, orgId, assigned) {
    const org = ORG_BY_ID[orgId];
    if (!org) return null;
    if (leader.wardAdmin) return 'ward_admin';
    if (!org.enabled) return null;
    if (leader.rcCodes.some((rc) => org.leader_seats.includes(rc))) return 'leader';
    const a = assigned || (await assignmentsOf(leader));
    return a[orgId] === 'leader' || a[orgId] === 'co_organizer' ? a[orgId] : null;
  }
  // Tools need area 22 (home.activities); participant names/contacts need area 23 (home.signup). Ward admins: both.
  async function eventAccess(leader, ev) {
    if (leader.wardAdmin) return { role: 'ward_admin', manage: true, contacts: true };
    let role = await orgRole(leader, ev.org_id);
    if (!role) {
      const co = await db.collection(C.COORG).doc(`${ev.id}__${leader.id}`).get();
      if (co.exists && ORG_BY_ID[ev.org_id] && ORG_BY_ID[ev.org_id].enabled) role = 'event_co_organizer';
    }
    if (!role) return { role: null, manage: false, contacts: false };
    return { role, manage: leader.areas.has(AREA_TOOLS), contacts: leader.areas.has(AREA_CONTACTS) };
  }
  async function requireEvent(ctx, need = 'manage') {
    const leader = await leaderOf(ctx);
    const { ref, ev } = await loadEvent(ctx.body.event_id);
    const acc = await eventAccess(leader, ev);
    if (!acc.role || !acc.manage || (need === 'contacts' && !acc.contacts)) {
      throw new HttpError(403, 'forbidden', need === 'contacts' ? 'You do not have access to participant names and contacts for this event.' : 'You do not have access to manage this event.');
    }
    return { leader, ref, ev, acc };
  }
  async function requireOrgManager(ctx, orgId, { assign = false } = {}) {
    const leader = await leaderOf(ctx);
    const role = await orgRole(leader, orgId);
    const ok = role === 'ward_admin' || ((role === 'leader' || (!assign && role === 'co_organizer')) && leader.areas.has(AREA_TOOLS));
    if (!ok) throw new HttpError(403, 'forbidden', 'You do not have access to manage this organization.');
    return { leader, role };
  }
  const stripEvent = (ev) => { const { passcode_hash, ...rest } = ev; return { ...rest, has_own_passcode: !!passcode_hash }; };

  // ---------- leader routes: org / events ----------
  async function adminMe(ctx) {
    const leader = await leaderOf(ctx);
    const assigned = await assignmentsOf(leader);
    const orgs = [];
    for (const o of ORGS) {
      const role = await orgRole(leader, o.id, assigned);
      if (!role) continue;
      const org = await getOrgDoc(o.id);
      orgs.push({
        id: o.id, name: o.name, enabled: o.enabled, youth: o.youth, role, default_access_level: o.default_access_level, has_default_passcode: !!org.default_passcode_hash,
        can_manage: role === 'ward_admin' || leader.areas.has(AREA_TOOLS), can_contacts: role === 'ward_admin' || leader.areas.has(AREA_CONTACTS),
        can_assign: role === 'ward_admin' || (role === 'leader' && leader.areas.has(AREA_TOOLS)),
      });
    }
    const co = await db.collection(C.COORG).where('user_id', '==', leader.id).get();
    if (!orgs.length && co.empty) throw new HttpError(403, 'not_authorized', 'This sign-in is not authorized for ward sign-ups.');
    await ensureSeeds();
    return { leader: { id: leader.id, name: leader.name, email: leader.email }, ward_admin: leader.wardAdmin, orgs, co_organizer_events: co.docs.map((d) => d.data().event_id) };
  }

  async function adminEventsList(ctx) {
    const leader = await leaderOf(ctx);
    const assigned = await assignmentsOf(leader);
    let docs;
    if (leader.wardAdmin) docs = (await db.collection(C.EVENTS).get()).docs;
    else {
      const orgIds = [];
      for (const o of ORGS) { const r = await orgRole(leader, o.id, assigned); if (r && leader.areas.has(AREA_TOOLS)) orgIds.push(o.id); }
      const parts = [];
      if (orgIds.length) parts.push(...(await db.collection(C.EVENTS).where('org_id', 'in', orgIds).get()).docs);
      if (leader.areas.has(AREA_TOOLS)) {
        const co = await db.collection(C.COORG).where('user_id', '==', leader.id).get();
        for (const d of co.docs) { const s = await db.collection(C.EVENTS).doc(d.data().event_id).get(); if (s.exists) parts.push(s); }
      }
      const seen = new Set(); docs = parts.filter((d) => (seen.has(d.id) ? false : seen.add(d.id)));
    }
    const filter = ctx.body.org_id ? String(ctx.body.org_id) : null;
    const events = docs.map((d) => ({ id: d.id, ...d.data() })).filter((e) => !filter || e.org_id === filter).map((e) => ({
      id: e.id, org_id: e.org_id, title: e.title, type: e.type, status: e.status, access_level: e.access_level, starts_at: e.starts_at || null,
      ends_at: e.ends_at || null, rsvp_counts: counts(e), purged: !!e.purged_at, template_id: e.template_id || null,
    })).sort((a, b) => String(b.starts_at || '').localeCompare(String(a.starts_at || '')));
    return { events };
  }

  function newEventDoc({ leader, org, src, title }) {
    const t = new Date(nowMs()).toISOString();
    const type = TYPES.includes(src.type) ? src.type : 'slots_plus_rsvp';
    const lvl = src.default_access_level || src.access_level;
    return {
      org_id: org.id, created_by: leader.id, organizer_name: leader.name, organizer_email: leader.email || '',
      type, title: title || src.title || 'New event', description: src.description || '', location: src.location || '',
      starts_at: null, ends_at: null, close_at: null, access_level: LEVELS.includes(lvl) ? lvl : org.default_access_level,
      passcode_hash: null, passcode_version: 0, passcode_updated_at: null,
      allow_guests: src.allow_guests !== undefined ? !!src.allow_guests : true, guest_cap: Number.isInteger(src.guest_cap) ? src.guest_cap : 4,
      headcount_cap: Number.isInteger(src.headcount_cap) ? src.headcount_cap : null,
      hide_names: src.hide_names !== undefined ? !!src.hide_names : !!org.youth,
      reminder_days_before: Number.isInteger(src.reminder_days_before) ? src.reminder_days_before : 0,
      noindex: true, status: 'draft', template_id: src.template_id || null, assets: Array.isArray(src.assets) ? src.assets.slice(0, 10).map((a) => ({ ...a })) : [],
      rsvp_counts: { yes: 0, no: 0, maybe: 0, yes_headcount: 0 }, reminder_sent_at: null, retention_days: null, purged_at: null,
      created_at: t, updated_at: t,
    };
  }
  async function createEventFrom(ctx, orgId, src, slotsSrc, title) {
    const { leader } = await requireOrgManager(ctx, orgId);
    const org = ORG_BY_ID[orgId];
    if (!org.enabled) throw new HttpError(409, 'org_disabled', `${org.name} sign-ups are not turned on yet.`);
    const doc = newEventDoc({ leader, org, src, title });
    const id = U.slugify(doc.title);
    const batch = db.batch();
    batch.create(db.collection(C.EVENTS).doc(id), doc);
    (slotsSrc || []).slice(0, 50).forEach((s, i) => batch.set(db.collection(C.SLOTS).doc(), {
      event_id: id, title: String(s.title || '').slice(0, 120) || 'Item', help_comment: String(s.help_comment || '').slice(0, 200),
      quantity_wanted: Number.isInteger(s.quantity_wanted) && s.quantity_wanted > 0 ? s.quantity_wanted : 1, filled: 0, sort: i, waitlist_enabled: false,
    }));
    await batch.commit();
    return { event_id: id };
  }
  async function adminEventsCreate(ctx) {
    const orgId = String(ctx.body.org_id || 'ward_activities');
    const title = ctx.body.title ? U.str(ctx.body.title, { max: 120, field: 'Title' }) : '';
    if (ctx.body.template_id) {
      await ensureSeeds();
      const s = await db.collection(C.TEMPLATES).doc(String(ctx.body.template_id)).get();
      if (!s.exists) throw new HttpError(404, 'not_found', 'Template not found.');
      const tpl = s.data();
      if (tpl.org_id && tpl.org_id !== orgId) throw new HttpError(403, 'forbidden', 'That template belongs to another organization.');
      return createEventFrom(ctx, orgId, { ...tpl, template_id: s.id }, tpl.slots, title);
    }
    return createEventFrom(ctx, orgId, { type: TYPES.includes(ctx.body.type) ? ctx.body.type : 'slots_plus_rsvp' }, [], title);
  }
  async function adminEventsDuplicate(ctx) {
    const { ev } = await requireEvent(ctx);
    const slots = await loadSlots(ev.id);
    return createEventFrom(ctx, ev.org_id, { ...ev, default_access_level: ev.access_level }, slots, `${ev.title} (copy)`);
  }

  async function participants(ev) {
    const [a, b] = await Promise.all([
      db.collection(C.SIGNUPS).where('event_id', '==', ev.id).get(),
      db.collection(C.RSVPS).where('event_id', '==', ev.id).get(),
    ]);
    const row = (d, kind) => {
      const x = d.data();
      return {
        kind, id: d.id, first_name: x.display_first_name, last_name: x.legal_last_name, email: x.contact_email, is_youth: !!x.is_youth, comment: x.comment || '',
        slot_id: x.slot_id || null, slot_title: x.slot_title || '', quantity: x.quantity || 0, response: x.response || '', adult_count: x.adult_count || 0, guest_count: x.guest_count || 0,
        created_at: x.created_at, canceled_at: x.canceled_at || null, removed_by_leader: !!x.removed_by,
      };
    };
    return [...a.docs.map((d) => row(d, 'signup')), ...b.docs.map((d) => row(d, 'rsvp'))].sort((x, y) => String(x.created_at).localeCompare(String(y.created_at)));
  }

  async function adminEventsGet(ctx) {
    const { ev, acc, leader } = await requireEvent(ctx);
    const slots = await loadSlots(ev.id);
    const org = await getOrgDoc(ev.org_id);
    const out = {
      event: stripEvent(ev), org: { id: org.id, name: org.name, has_default_passcode: !!org.default_passcode_hash, youth: org.youth },
      slots: slots.map(({ ref, ...s }) => s), access: acc, ward_admin: leader.wardAdmin,
      preview: await publicView({ ...ev, status: ev.status === 'draft' ? 'published' : ev.status }, slots),
    };
    const co = await db.collection(C.COORG).where('event_id', '==', ev.id).get();
    out.co_organizers = co.docs.map((d) => ({ user_id: d.data().user_id, name: d.data().name || '' }));
    out.participants = null; out.invites = null;
    if (acc.contacts) {
      out.participants = await participants(ev);
      const inv = await db.collection(C.INVITES).where('event_id', '==', ev.id).get();
      const t = nowMs();
      out.invites = inv.docs.map((d) => { const x = d.data(); return { id: d.id, email: x.email, created_at: x.created_at, expires_at: x.expires_at, revoked_at: x.revoked_at || null, used_at: x.used_at || null, active: !x.revoked_at && x.expires_at > t }; });
    }
    return out;
  }

  // ---------- leader routes: editing ----------
  function readEventInput(b, existing) {
    const out = {};
    const has = (k) => Object.prototype.hasOwnProperty.call(b, k);
    if (has('title')) out.title = U.str(b.title, { max: 120, min: 1, field: 'Title' });
    if (has('description')) out.description = U.str(b.description, { max: 4000, field: 'Description', multiline: true });
    if (has('location')) out.location = U.str(b.location, { max: 200, field: 'Location' });
    if (has('type')) { if (!TYPES.includes(b.type)) throw new HttpError(400, 'invalid', 'Pick a sign-up type.'); out.type = b.type; }
    if (has('starts_at')) out.starts_at = U.isoDate(b.starts_at, 'Start', { optional: true });
    if (has('ends_at')) out.ends_at = U.isoDate(b.ends_at, 'End', { optional: true });
    if (has('close_at')) out.close_at = U.isoDate(b.close_at, 'Sign-ups close', { optional: true });
    if (has('access_level')) { if (!LEVELS.includes(b.access_level)) throw new HttpError(400, 'invalid', 'Pick an access level.'); out.access_level = b.access_level; }
    if (has('allow_guests')) out.allow_guests = U.bool(b.allow_guests);
    if (has('guest_cap')) out.guest_cap = U.int(b.guest_cap, { min: 0, max: 50, field: 'Guests per RSVP' });
    if (has('headcount_cap')) out.headcount_cap = b.headcount_cap === null || b.headcount_cap === '' ? null : U.int(b.headcount_cap, { min: 1, max: 5000, field: 'Headcount cap' });
    if (has('hide_names')) out.hide_names = U.bool(b.hide_names);
    if (has('reminder_days_before')) out.reminder_days_before = U.int(b.reminder_days_before, { min: 0, max: 14, field: 'Reminder days' });
    if (has('noindex')) out.noindex = U.bool(b.noindex);
    if (has('organizer_name')) out.organizer_name = U.str(b.organizer_name, { max: 80, field: 'Organizer name' });
    if (has('organizer_email')) out.organizer_email = b.organizer_email ? U.email(b.organizer_email, 'Organizer email') : '';
    if (has('retention_days')) out.retention_days = b.retention_days === null || b.retention_days === '' ? null : U.int(b.retention_days, { min: 30, max: 90, field: 'Keep data (days)' });
    if (has('assets')) {
      if (!Array.isArray(b.assets) || b.assets.length > 10) throw new HttpError(400, 'invalid', 'Up to 10 images or attachments.');
      out.assets = b.assets.map((a) => {
        const kind = a && a.kind === 'image' ? 'image' : 'attachment';
        const consent = U.bool(a && a.consent);
        if (kind === 'image' && !consent) throw new HttpError(400, 'consent_required', 'Confirm the photo has no people in it, or that you have their consent, before posting it.');
        return { kind, url: U.httpsUrl(a.url, 'Image or attachment link'), filename: U.str(a.filename, { max: 120, field: 'File name' }), caption: U.str(a.caption, { max: 200, field: 'Caption' }), consent };
      });
    }
    const merged = { ...existing, ...out };
    if (merged.access_level !== 'public') { merged.noindex = true; out.noindex = true; }
    if (merged.starts_at && merged.ends_at && ms(merged.ends_at) <= ms(merged.starts_at)) throw new HttpError(400, 'invalid', 'The end must be after the start.');
    if (merged.close_at && merged.ends_at && ms(merged.close_at) > ms(merged.ends_at)) throw new HttpError(400, 'invalid', 'Sign-ups must close before the event ends.');
    return { out, merged };
  }
  function readSlotsInput(raw) {
    if (!Array.isArray(raw) || raw.length > 50) throw new HttpError(400, 'invalid', 'Up to 50 items.');
    return raw.map((s, i) => ({
      id: s && typeof s.id === 'string' && s.id ? s.id : null,
      title: U.str(s && s.title, { max: 120, min: 1, field: `Item ${i + 1} name` }),
      help_comment: U.str(s && s.help_comment, { max: 200, field: `Item ${i + 1} note` }),
      quantity_wanted: U.int(s && s.quantity_wanted, { min: 1, max: 500, field: `Item ${i + 1} quantity` }),
      sort: i,
    }));
  }
  async function publishProblems(ev, slotsCount) {
    const p = [];
    if (!ev.title) p.push('a title');
    if (!ev.starts_at || !ev.ends_at) p.push('start and end times');
    if (hasSlots(ev.type) && slotsCount < 1) p.push('at least one item');
    if (hasRsvp(ev.type) && !ev.headcount_cap) p.push('a headcount cap (Yes + guests)');
    if (ev.access_level === 'passcode' && !(await passcodeTarget(ev))) p.push('a passcode (or an organization default passcode)');
    return p;
  }

  async function adminEventsSave(ctx) {
    const { ev: pre } = await requireEvent(ctx);
    const t = new Date(nowMs()).toISOString();
    const slotsIn = ctx.body.slots !== undefined ? readSlotsInput(ctx.body.slots) : null;
    const { out, merged } = readEventInput(ctx.body.fields || {}, pre);
    await db.runTransaction(async (tx) => {
      const { ref, ev } = await loadEvent(pre.id, tx);
      const slots = await loadSlots(ev.id, tx);
      const c = counts(ev);
      if (hasRsvp(ev.type) && !hasRsvp(merged.type) && (c.yes + c.no + c.maybe) > 0) throw new HttpError(409, 'in_use', 'This event already has RSVPs, so RSVP can’t be turned off.');
      if (hasSlots(ev.type) && !hasSlots(merged.type) && slots.some((s) => (s.filled || 0) > 0)) throw new HttpError(409, 'in_use', 'Items already have sign-ups, so items can’t be turned off.');
      if (merged.headcount_cap && merged.headcount_cap < c.yes_headcount) throw new HttpError(409, 'cap_below', `The headcount cap can’t be lower than the ${c.yes_headcount} people already coming.`);
      if (ev.status !== 'draft' && hasRsvp(merged.type) && !merged.headcount_cap) throw new HttpError(400, 'invalid', 'RSVP events need a headcount cap.');
      if (slotsIn) {
        const byId = Object.fromEntries(slots.map((s) => [s.id, s]));
        const keep = new Set();
        for (const s of slotsIn.filter((x) => x.id)) {
          const cur = byId[s.id];
          if (!cur) throw new HttpError(409, 'stale', 'The item list changed. Please reload.');
          if (s.quantity_wanted < (cur.filled || 0)) throw new HttpError(409, 'qty_below', `${s.title} already has ${cur.filled} signed up.`);
          keep.add(s.id);
        }
        for (const cur of slots) if (!keep.has(cur.id) && (cur.filled || 0) > 0) throw new HttpError(409, 'slot_in_use', `${cur.title} has sign-ups. Remove those entries first.`);
        for (const s of slotsIn.filter((x) => x.id)) tx.update(byId[s.id].ref, { title: s.title, help_comment: s.help_comment, quantity_wanted: s.quantity_wanted, sort: s.sort });
        for (const cur of slots) if (!keep.has(cur.id)) tx.delete(cur.ref);
        for (const s of slotsIn.filter((x) => !x.id)) tx.set(db.collection(C.SLOTS).doc(), { event_id: ev.id, title: s.title, help_comment: s.help_comment, quantity_wanted: s.quantity_wanted, filled: 0, sort: s.sort, waitlist_enabled: false });
      }
      tx.update(ref, { ...out, updated_at: t });
    });
    return { saved: true };
  }

  async function adminEventsStatus(ctx) {
    const { ref, ev } = await requireEvent(ctx);
    const status = ctx.body.status;
    if (!STATUSES.includes(status)) throw new HttpError(400, 'invalid', 'Unknown status.');
    if (ev.purged_at && status !== 'closed') throw new HttpError(409, 'purged', 'This event’s personal data was removed after the retention period; it can’t be reopened.');
    if (status === 'published') {
      const p = await publishProblems(ev, (await loadSlots(ev.id)).length);
      if (p.length) throw new HttpError(400, 'not_ready', `Before publishing, add ${p.join(', ')}.`);
    }
    await ref.update({ status, updated_at: new Date(nowMs()).toISOString() });
    return { status };
  }

  function readPasscode(v) {
    if (v === null || v === undefined || v === '') return null;
    return U.str(v, { max: 64, min: 4, field: 'Passcode' });
  }
  async function adminEventsPasscode(ctx) {
    const { ref, ev } = await requireEvent(ctx);
    const p = readPasscode(ctx.body.passcode);
    const t = new Date(nowMs()).toISOString();
    // A new version invalidates every remembered device for this event.
    await ref.update({ passcode_hash: p ? U.hashPasscode(p) : null, passcode_version: (ev.passcode_version || 0) + 1, passcode_updated_at: t, updated_at: t });
    return { has_own_passcode: !!p };
  }
  async function adminOrgPasscode(ctx) {
    const orgId = String(ctx.body.org_id || '');
    await requireOrgManager(ctx, orgId, { assign: true });
    const p = readPasscode(ctx.body.passcode);
    const org = await getOrgDoc(orgId);
    const t = new Date(nowMs()).toISOString();
    await db.collection(C.ORGS).doc(orgId).set({ id: orgId, slug: org.slug, name: org.name, default_passcode_hash: p ? U.hashPasscode(p) : null, passcode_version: (org.passcode_version || 0) + 1, passcode_updated_at: t }, { merge: true });
    return { has_default_passcode: !!p };
  }

  async function adminLeaders(ctx) {
    await requireOrgManager(ctx, String(ctx.body.org_id || 'ward_activities'));
    const s = await db.collection('ward_leaders').get();
    return { leaders: s.docs.filter((d) => d.data().active !== false).map((d) => ({ id: d.id, name: String(d.data().displayName || d.data().name || '').trim() })).filter((l) => l.name).sort((a, b) => a.name.localeCompare(b.name)) };
  }
  async function leaderName(id) {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(String(id || ''))) throw new HttpError(400, 'invalid', 'Pick a leader.');
    const s = await db.collection('ward_leaders').doc(id).get();
    if (!s.exists || s.data().active === false) throw new HttpError(404, 'not_found', 'That leader was not found.');
    return String(s.data().displayName || s.data().name || '').trim();
  }
  async function adminAssignList(ctx) {
    const orgId = String(ctx.body.org_id || '');
    await requireOrgManager(ctx, orgId);
    const s = await db.collection(C.ASSIGN).where('org_id', '==', orgId).get();
    return { assignments: s.docs.map((d) => ({ user_id: d.data().user_id, name: d.data().name || '', role: d.data().role, created_at: d.data().created_at })) };
  }
  async function adminAssignAdd(ctx) {
    const orgId = String(ctx.body.org_id || '');
    const { leader } = await requireOrgManager(ctx, orgId, { assign: true });
    const role = ctx.body.role === 'leader' ? 'leader' : 'co_organizer';
    if (role === 'leader' && !leader.wardAdmin) throw new HttpError(403, 'forbidden', 'Only ward admins can add organization leaders.');
    const name = await leaderName(ctx.body.user_id);
    await db.collection(C.ASSIGN).doc(`${orgId}__${ctx.body.user_id}`).set({ user_id: ctx.body.user_id, org_id: orgId, role, name, assigned_by: leader.id, created_at: new Date(nowMs()).toISOString() });
    return { added: true };
  }
  async function adminAssignRemove(ctx) {
    const orgId = String(ctx.body.org_id || '');
    await requireOrgManager(ctx, orgId, { assign: true });
    await db.collection(C.ASSIGN).doc(`${orgId}__${String(ctx.body.user_id || '')}`).delete();
    return { removed: true };
  }
  async function adminCoorgAdd(ctx) {
    const { ev, leader } = await requireEvent(ctx);
    const name = await leaderName(ctx.body.user_id);
    await db.collection(C.COORG).doc(`${ev.id}__${ctx.body.user_id}`).set({ event_id: ev.id, user_id: ctx.body.user_id, name, assigned_by: leader.id, created_at: new Date(nowMs()).toISOString() });
    return { added: true };
  }
  async function adminCoorgRemove(ctx) {
    const { ev } = await requireEvent(ctx);
    await db.collection(C.COORG).doc(`${ev.id}__${String(ctx.body.user_id || '')}`).delete();
    return { removed: true };
  }

  // ---------- leader routes: participants, invites, reminders, export ----------
  async function adminEntryDelete(ctx) {
    const { ev, leader } = await requireEvent(ctx, 'contacts');
    const kind = ctx.body.kind === 'rsvp' ? 'rsvp' : 'signup';
    const id = String(ctx.body.id || '');
    if (!/^[A-Za-z0-9]{1,64}$/.test(id)) throw new HttpError(404, 'not_found', 'Entry not found.');
    const t = new Date(nowMs()).toISOString();
    await db.runTransaction(async (tx) => {
      const { ref: evRef, ev: cur } = await loadEvent(ev.id, tx);
      const s = await tx.get(db.collection(kind === 'rsvp' ? C.RSVPS : C.SIGNUPS).doc(id));
      if (!s.exists || s.data().event_id !== ev.id) throw new HttpError(404, 'not_found', 'Entry not found.');
      if (s.data().canceled_at) return;
      const row = { id: s.id, ref: s.ref, ...s.data() };
      await cancelEntries(tx, cur, evRef, kind === 'signup' ? [row] : [], kind === 'rsvp' ? row : null, t, { removed_by: leader.id });
    });
    return { removed: true };
  }

  async function adminInvitesCreate(ctx) {
    const { ev, leader } = await requireEvent(ctx, 'contacts');
    if (!Array.isArray(ctx.body.emails) || !ctx.body.emails.length || ctx.body.emails.length > 200) throw new HttpError(400, 'invalid', 'Add 1 to 200 email addresses.');
    const emails = [...new Set(ctx.body.emails.map((e) => U.email(e)))];
    const expires = ctx.body.expires_at ? ms(U.isoDate(ctx.body.expires_at, 'Invite expiry')) : tokenExpiry(ev);
    if (!(expires > nowMs())) throw new HttpError(400, 'invalid', 'The invite expiry must be in the future.');
    const t = new Date(nowMs()).toISOString();
    let sent = 0;
    for (const to of emails) {
      const ref = db.collection(C.INVITES).doc();
      const secret = U.randomToken(32);
      await ref.set({ event_id: ev.id, org_id: ev.org_id, email: to, token_hash: U.sha256(secret), expires_at: expires, revoked_at: null, used_at: null, invited_by: leader.id, created_at: t });
      const link = `${linkOrigin(ctx.req)}/signup/${ev.id}#i=i.${ref.id}.${secret}`;
      if (await sendSafe(M.inviteEmail({ ev, to, link, expiresAt: new Date(expires).toISOString(), replyTo: ev.organizer_email || undefined }))) sent += 1;
    }
    return { invited: emails.length, emailed: sent };
  }
  async function adminInvitesRevoke(ctx) {
    const { ev } = await requireEvent(ctx, 'contacts');
    const t = nowMs();
    const mode = ctx.body.mode === 'expire' ? 'expire' : 'revoke';
    const patch = mode === 'expire' ? { expires_at: t } : { revoked_at: new Date(t).toISOString() };
    let docs;
    if (ctx.body.all === true) docs = (await db.collection(C.INVITES).where('event_id', '==', ev.id).get()).docs;
    else {
      const s = await db.collection(C.INVITES).doc(String(ctx.body.invite_id || 'x')).get();
      if (!s.exists || s.data().event_id !== ev.id) throw new HttpError(404, 'not_found', 'Invite not found.');
      docs = [s];
    }
    const batch = db.batch(); let n = 0;
    docs.forEach((d) => { if (!d.data().revoked_at) { batch.update(d.ref, patch); n += 1; } });
    if (n) await batch.commit();
    return { changed: n, mode };
  }

  async function remindersFor(ev) {
    const [a, b] = await Promise.all([
      db.collection(C.SIGNUPS).where('event_id', '==', ev.id).where('canceled_at', '==', null).get(),
      db.collection(C.RSVPS).where('event_id', '==', ev.id).where('canceled_at', '==', null).get(),
    ]);
    const byEmail = {};
    const get = (x) => (byEmail[x.contact_email] = byEmail[x.contact_email] || { first: x.display_first_name, items: [], rsvp: null });
    a.docs.forEach((d) => { const x = d.data(); get(x).items.push({ title: x.slot_title, quantity: x.quantity }); });
    b.docs.forEach((d) => { const x = d.data(); if (x.response !== 'no') get(x).rsvp = { response: x.response }; });
    let sent = 0;
    for (const [to, v] of Object.entries(byEmail)) {
      if (!v.items.length && !v.rsvp) continue;
      if (await sendSafe(M.reminderEmail({ ev, to, firstName: v.first, items: v.items, rsvp: v.rsvp, replyTo: ev.organizer_email || undefined }))) sent += 1;
    }
    return sent;
  }
  async function adminRemindersSend(ctx) {
    const { ev, ref } = await requireEvent(ctx, 'contacts');
    if (ev.status !== 'published') throw new HttpError(409, 'not_published', 'Publish the event before sending reminders.');
    const sent = await remindersFor(ev);
    await ref.update({ reminder_sent_at: new Date(nowMs()).toISOString() });
    return { emailed: sent };
  }

  async function adminExport(ctx) {
    const { ev } = await requireEvent(ctx, 'contacts');
    const rows = await participants(ev);
    const head = ['type', 'item', 'quantity', 'rsvp', 'adults', 'guests', 'first_name', 'last_name', 'email', 'youth', 'comment', 'signed_up', 'status'];
    const lines = [head.join(',')];
    rows.forEach((r) => lines.push([r.kind, r.slot_title, r.kind === 'signup' ? r.quantity : '', r.response, r.kind === 'rsvp' ? r.adult_count : '', r.kind === 'rsvp' ? r.guest_count : '',
      r.first_name, r.last_name, r.email, r.is_youth ? 'yes' : '', r.comment, r.created_at, r.canceled_at ? (r.removed_by_leader ? 'removed' : 'canceled') : 'active'].map(U.csvCell).join(',')));
    return { filename: `${ev.id}.csv`, csv: `${lines.join('\r\n')}\r\n` };
  }

  // ---------- templates ----------
  async function adminTemplatesList(ctx) {
    const leader = await leaderOf(ctx);
    await ensureSeeds();
    const assigned = await assignmentsOf(leader);
    const s = await db.collection(C.TEMPLATES).get();
    const out = [];
    for (const d of s.docs) {
      const x = d.data();
      if (x.org_id && !(await orgRole(leader, x.org_id, assigned))) continue;
      out.push({ id: d.id, name: x.name, org_id: x.org_id || null, type: x.type, builtin: !!x.builtin, slots: (x.slots || []).length, created_at: x.created_at,
        can_delete: !x.builtin && (leader.wardAdmin || (!!x.org_id && leader.areas.has(AREA_TOOLS))) });
    }
    return { templates: out.sort((a, b) => a.name.localeCompare(b.name)) };
  }
  async function adminTemplatesSaveFromEvent(ctx) {
    const { ev, leader } = await requireEvent(ctx);
    const wardWide = ctx.body.ward_wide === true;
    if (wardWide && !leader.wardAdmin) throw new HttpError(403, 'forbidden', 'Only ward admins can save ward-wide templates.');
    const name = U.str(ctx.body.name || ev.title, { max: 80, min: 1, field: 'Template name' });
    const slots = await loadSlots(ev.id);
    const ref = db.collection(C.TEMPLATES).doc();
    // Snapshot of content and defaults only: no participant data, passcodes or invites.
    await ref.set({
      org_id: wardWide ? null : ev.org_id, created_by: leader.id, builtin: false, name, type: ev.type, title: ev.title, description: ev.description || '', location: ev.location || '',
      default_access_level: ev.access_level, hide_names: !!ev.hide_names, allow_guests: !!ev.allow_guests, guest_cap: ev.guest_cap || 0, headcount_cap: ev.headcount_cap || null,
      reminder_days_before: ev.reminder_days_before || 0, noindex: true,
      slots: slots.map((s) => ({ title: s.title, help_comment: s.help_comment || '', quantity_wanted: s.quantity_wanted })),
      assets: (ev.assets || []).map((a) => ({ ...a })), created_at: new Date(nowMs()).toISOString(),
    });
    return { template_id: ref.id };
  }
  async function adminTemplatesDelete(ctx) {
    const leader = await leaderOf(ctx);
    const ref = db.collection(C.TEMPLATES).doc(String(ctx.body.template_id || 'x'));
    const s = await ref.get();
    if (!s.exists) throw new HttpError(404, 'not_found', 'Template not found.');
    const x = s.data();
    if (x.builtin) throw new HttpError(409, 'builtin', 'Starter templates can’t be deleted.');
    if (x.org_id) await requireOrgManager(ctx, x.org_id);
    else if (!leader.wardAdmin) throw new HttpError(403, 'forbidden', 'Only ward admins can delete ward-wide templates.');
    await ref.delete();
    return { deleted: true };
  }

  const ROUTES = {
    '/public/event': pubEvent, '/public/passcode': pubPasscode, '/public/submit': pubSubmit,
    '/public/manage': pubManage, '/public/manage/update': pubManageUpdate, '/public/manage/cancel': pubManageCancel,
    '/admin/me': adminMe, '/admin/events/list': adminEventsList, '/admin/events/create': adminEventsCreate, '/admin/events/duplicate': adminEventsDuplicate,
    '/admin/events/get': adminEventsGet, '/admin/events/save': adminEventsSave, '/admin/events/status': adminEventsStatus, '/admin/events/passcode': adminEventsPasscode,
    '/admin/events/coorganizers/add': adminCoorgAdd, '/admin/events/coorganizers/remove': adminCoorgRemove,
    '/admin/entries/delete': adminEntryDelete, '/admin/invites/create': adminInvitesCreate, '/admin/invites/revoke': adminInvitesRevoke,
    '/admin/reminders/send': adminRemindersSend, '/admin/export': adminExport,
    '/admin/orgs/passcode': adminOrgPasscode, '/admin/orgs/assignments/list': adminAssignList, '/admin/orgs/assignments/add': adminAssignAdd,
    '/admin/orgs/assignments/remove': adminAssignRemove, '/admin/leaders': adminLeaders,
    '/admin/templates/list': adminTemplatesList, '/admin/templates/save_from_event': adminTemplatesSaveFromEvent, '/admin/templates/delete': adminTemplatesDelete,
  };

  function send(res, status, obj) {
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.status(status).json(obj);
  }

  async function handler(req, res) {
    try {
      if (req.method !== 'POST') throw new HttpError(405, 'method', 'Method not allowed.');
      const origin = (req.headers || {}).origin;
      const localOk = emulator && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin || '');
      if (origin && !ALLOWED_ORIGINS.has(origin) && !localOk) throw new HttpError(403, 'origin', 'Requests from this site are not allowed.');
      const route = String(req.path || '/').replace(/^\/api\/signup/, '').replace(/\/+$/, '') || '/';
      const fn = Object.prototype.hasOwnProperty.call(ROUTES, route) ? ROUTES[route] : null;
      if (!fn) throw new HttpError(404, 'not_found', 'Unknown request.');
      const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
      const out = await fn({ req, res, body });
      send(res, 200, { ok: true, ...out });
    } catch (e) {
      if (e instanceof HttpError) send(res, e.status, { ok: false, error: e.code, message: e.message, ...(e.needs ? { needs: e.needs } : {}) });
      else { console.error('signupApi error:', e && e.message ? e.message : e); send(res, 500, { ok: false, error: 'server', message: 'Something went wrong. Please try again.' }); }
    }
  }

  // ---------- daily job: reminders, retention purge, rate-limit cleanup ----------
  async function purgeEvent(ev) {
    let removed = 0;
    for (const col of [C.SIGNUPS, C.RSVPS, C.INVITES]) {
      for (;;) {
        const s = await db.collection(col).where('event_id', '==', ev.id).limit(300).get();
        if (s.empty) break;
        const batch = db.batch();
        s.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();
        removed += s.size;
      }
    }
    // Keeps the event, item totals and RSVP counts (no personal data); names, emails, comments and invites are deleted.
    await db.collection(C.EVENTS).doc(ev.id).update({ purged_at: new Date(nowMs()).toISOString(), status: 'closed', personal_data_removed: removed });
    return removed;
  }
  async function runDaily() {
    const t = nowMs();
    const set = await settings();
    const report = { reminded: 0, purged_events: 0, purged_docs: 0, ratelimits_deleted: 0 };
    const all = await db.collection(C.EVENTS).get();
    for (const d of all.docs) {
      const ev = { id: d.id, ...d.data() };
      if (ev.status === 'published' && !ev.purged_at && ev.reminder_days_before > 0 && !ev.reminder_sent_at && ev.starts_at) {
        const start = ms(ev.starts_at);
        if (t >= start - ev.reminder_days_before * DAY && t < start) {
          report.reminded += await remindersFor(ev);
          await d.ref.update({ reminder_sent_at: new Date(t).toISOString() });
        }
      }
      const days = Number.isInteger(ev.retention_days) ? ev.retention_days : set.retention_days;
      if (!ev.purged_at && ev.ends_at && ms(ev.ends_at) + days * DAY <= t) {
        report.purged_docs += await purgeEvent(ev);
        report.purged_events += 1;
      }
    }
    const rl = await db.collection(C.RATE).where('expires_at', '<=', t).limit(500).get();
    if (!rl.empty) { const b = db.batch(); rl.docs.forEach((x) => b.delete(x.ref)); await b.commit(); report.ratelimits_deleted = rl.size; }
    return report;
  }

  return { handler, runDaily, ROUTES, collections: C };
}

module.exports = { createApp, ALLOWED_ORIGINS, COOKIE_NAME, DEFAULT_RETENTION_DAYS };
