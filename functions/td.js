'use strict';
// v1.2.0 (2026-11-22, Duane voice 10:06 PM ET): safe replacement for the public /td reschedule write.
// - tdReschedule (HTTPS): a member moves their own household to an open Tithing Declaration slot. The server checks the
//   household is on the schedule and that the typed email equals the email on file, then moves it inside a Firestore
//   transaction (Admin SDK) and refreshes the sanitized public view in the same transaction.
// - tdPublicSync (Firestore trigger): any write to home_content/tithing_declaration_<year> (e.g. Bishopric Hub edits)
//   rewrites td_public/<year>: dates, slot times, open/booked flags, counts, and (v1.2.1) the household name on booked
//   slots only, plus (v1.2.2) member names, as the public page showed before 1.2.0. No householdId, email or notes.
// Nothing here returns household members, emails or notes to the caller.
const crypto = require('node:crypto');
const { Timestamp, FieldValue } = require('firebase-admin/firestore');

const TD_DOC_RE = /^tithing_declaration_(\d{4})$/;
const TD_YEAR = '2026';
const TD_COLLECTION = 'home_content';
const TD_PUBLIC_COLLECTION = 'td_public';
const RATE_COLLECTION = 'td_rate_limits';
const RATE_PER_IP_PER_HOUR = 40;
const BAD_EMAIL_PER_HOUSEHOLD_PER_HOUR = 5;
const CONTACT_MSG = 'Please contact the bishopric (Brother McDonald, executive secretary) to change your appointment.';

class TdError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

// ---- same rules the /td page uses (td/index.html isSlotTdOpen / isSlotTdInterview / normalizeSurname / compactSurname) ----
function isSlotTdOpen(slot) {
  if (!slot || !slot.available) return false;
  if (slot.tdOpen === false) return false;
  if (Array.isArray(slot.interviewTypes) && slot.interviewTypes.length > 0 && !slot.interviewTypes.includes('TD')) return false;
  return true;
}
function isSlotTdInterview(slot) {
  if (!slot || slot.available) return false;
  if (slot.isNonTdIndividual) return false;
  if (!Array.isArray(slot.interviewTypes)) return true;
  return slot.interviewTypes.includes('TD');
}
function normalizeSurname(val) {
  return String(val || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}
function compactSurname(val) { return String(val || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
function emailsOf(raw) {
  return String(raw || '').toLowerCase().split(/[\s,;]+/).map(s => s.trim()).filter(s => s.includes('@'));
}

// ---- sanitized public view ----
const str = (v, max = 120) => (typeof v === 'string' ? v.slice(0, max) : undefined);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
function clean(o) { for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k]; return o; }
function publicSlot(sl) {
  const open = isSlotTdOpen(sl);
  const status = sl.status === 'attended' ? 'attended' : (open ? 'open' : 'scheduled');
  return clean({
    slotIndex: num(sl.slotIndex), time: str(sl.time, 40), startTime24: str(sl.startTime24, 5),
    durationMinutes: num(sl.durationMinutes), available: open, tdOpen: true, interviewTypes: ['TD'], status,
    // v1.2.1 (Duane voice 10:46 PM ET): household name on booked slots only (no id, email or notes)
    household: (open ? '' : String(sl.household || '').trim().slice(0, 80)) || undefined,
    // v1.2.2 (Duane chat 10:50 PM ET): member names under the household, as the pre-1.2.0 page showed
    members: (open ? '' : String(sl.members || '').trim().slice(0, 300)) || undefined
  });
}
function publicView(data, year) {
  const sundays = (Array.isArray(data && data.sundays) ? data.sundays : []).map(s => clean({
    date: str(s.date, 10), dayOfWeek: str(s.dayOfWeek, 12), shortDate: str(s.shortDate, 24), tabName: str(s.tabName, 60),
    timeWindow: str(s.timeWindow, 40), title: str(s.title, 80), totalSlots: num(s.totalSlots), openCount: num(s.openCount),
    scheduledCount: num(s.scheduledCount),
    // only slots the public page shows: TD-open slots and booked TD interviews (household + member names only on booked slots)
    slots: (Array.isArray(s.slots) ? s.slots : []).filter(sl => isSlotTdOpen(sl) || isSlotTdInterview(sl)).map(publicSlot)
  }));
  return clean({
    year: String(year), title: str(data && data.title, 80), subtitle: str(data && data.subtitle, 120),
    totalScheduled: num(data && data.totalScheduled), totalOpenSlots: num(data && data.totalOpenSlots),
    updatedAt: str((data && (data.updatedAtIso || data.updatedAt)) || '', 40) || null,
    sundays, source: 'tdPublicSync v1.2.0'
  });
}

// ---- household lookup (same matching as the /td page gate, but on the server) ----
function entriesOf(data) {
  const out = [];
  (Array.isArray(data.sundays) ? data.sundays : []).forEach((s, si) => (Array.isArray(s.slots) ? s.slots : []).forEach((sl, i) => {
    if (isSlotTdInterview(sl) && String(sl.household || '').trim()) out.push({ kind: 'slot', si, i, rec: sl });
  }));
  (Array.isArray(data.unassigned) ? data.unassigned : []).forEach((u, i) => {
    if (!u || !String(u.household || '').trim()) return;
    if (Array.isArray(u.interviewTypes) && !u.interviewTypes.includes('TD')) return;
    out.push({ kind: 'unassigned', i, rec: u });
  });
  for (const e of out) {
    const id = String(e.rec.householdId || '').trim();
    e.key = id ? `id:${id}` : `n:${normalizeSurname(e.rec.household)}`;
  }
  return out;
}
function candidatesFor(data, raw) {
  const cleaned = normalizeSurname(raw); const compact = compactSurname(raw);
  if (!cleaned || compact.length < 2) return [];
  const all = entriesOf(data);
  let hit = all.filter(e => normalizeSurname(e.rec.household) === cleaned || compactSurname(e.rec.household) === compact);
  if (!hit.length) {
    const stop = new Set(['the', 'family', 'household', 'brother', 'sister', 'bishop']);
    const tokens = cleaned.split(' ').filter(t => t.length >= 2 && !stop.has(t));
    hit = all.filter(e => tokens.some(t => normalizeSurname(e.rec.household) === t || compactSurname(e.rec.household) === t));
  }
  const keys = new Set(hit.map(e => e.key));
  return all.filter(e => keys.has(e.key)); // every entry (slot + unassigned) of each matching household
}

// ---- time helpers (America/New_York, like the page) ----
function todayEastern(now = new Date()) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const g = (t) => p.find(x => x.type === t).value;
  return `${g('year')}-${g('month')}-${g('day')}`;
}
function nowMinutesEastern(now = new Date()) {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  return Number(p.find(x => x.type === 'hour').value) * 60 + Number(p.find(x => x.type === 'minute').value);
}
function slotStartMinutes(sl) {
  const m24 = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(sl.startTime24 || '').trim());
  if (m24) return Number(m24[1]) * 60 + Number(m24[2]);
  const m = /(\d{1,2}):(\d{2})\s*(AM|PM)?/i.exec(String(sl.time || ''));
  if (!m) return null;
  let h = Number(m[1]); const mer = (m[3] || (/\bPM\b/i.test(sl.time) ? 'PM' : /\bAM\b/i.test(sl.time) ? 'AM' : '')).toUpperCase();
  if (mer === 'PM' && h < 12) h += 12; else if (mer === 'AM' && h === 12) h = 0; else if (!mer && h >= 1 && h <= 10) h += 12;
  return h * 60 + Number(m[2]);
}
function isPastSlot(dateIso, sl, now = new Date()) {
  const today = todayEastern(now);
  if (dateIso < today) return true;
  if (dateIso > today) return false;
  const start = slotStartMinutes(sl);
  return start != null && start <= nowMinutesEastern(now);
}
function recount(data) {
  let totalScheduled = 0; let totalOpen = 0;
  data.sundays.forEach(s => {
    const slots = Array.isArray(s.slots) ? s.slots : [];
    const openCount = slots.filter(sl => sl.available).length;
    s.openCount = openCount; s.scheduledCount = slots.length - openCount; s.totalSlots = slots.length;
    totalScheduled += s.scheduledCount; totalOpen += openCount;
  });
  data.totalScheduled = totalScheduled; data.totalOpenSlots = totalOpen;
}
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 40);
function hourBucket(now = new Date()) { return now.toISOString().slice(0, 13); }
function clientIp(req) {
  const xf = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return xf || req.ip || (req.socket && req.socket.remoteAddress) || 'unknown';
}

// Pure move on a plain copy of the schedule doc. Returns { next, household, from, to } or throws TdError.
function planMove(data, input, now = new Date()) {
  if (!data || !Array.isArray(data.sundays)) throw new TdError(503, 'schedule-unavailable', 'The schedule is not available right now. Please try again later.');
  const cands = candidatesFor(data, input.household);
  if (!cands.length) throw new TdError(404, 'unknown-household', `We could not find that household on the Tithing Declaration schedule. Check the spelling of your family name, or ${CONTACT_MSG.charAt(0).toLowerCase()}${CONTACT_MSG.slice(1)}`);
  const typed = String(input.email || '').trim().toLowerCase();
  const byKey = new Map();
  for (const e of cands) { if (!byKey.has(e.key)) byKey.set(e.key, []); byKey.get(e.key).push(e); }
  const withEmail = [...byKey.entries()].filter(([, es]) => es.some(e => emailsOf(e.rec.email).length));
  if (!withEmail.length) throw new TdError(409, 'no-email-on-file', `We don't have an email on file for this household, so it can't be verified online. ${CONTACT_MSG}`);
  const matched = withEmail.filter(([, es]) => es.some(e => emailsOf(e.rec.email).includes(typed)));
  if (!matched.length) throw new TdError(403, 'email-mismatch', `That email does not match the one on file for this household. Use the household email the bishopric has on file, or ${CONTACT_MSG.charAt(0).toLowerCase()}${CONTACT_MSG.slice(1)}`);
  if (matched.length > 1) throw new TdError(409, 'ambiguous-household', `More than one household matches. ${CONTACT_MSG}`);
  const [key, mine] = matched[0];
  if (mine.some(e => e.kind === 'slot' && e.rec.status === 'attended')) throw new TdError(409, 'already-attended', `Our records show this household's interview already took place. ${CONTACT_MSG}`);

  const next = JSON.parse(JSON.stringify(data));
  const sIdx = next.sundays.findIndex(s => s.date === input.date);
  const sunday = sIdx >= 0 ? next.sundays[sIdx] : null;
  const slots = sunday && Array.isArray(sunday.slots) ? sunday.slots : [];
  let tIdx = -1;
  if (Number.isInteger(input.slotIndex)) tIdx = slots.findIndex(sl => sl.slotIndex === input.slotIndex && sl.time === input.time);
  if (tIdx < 0) tIdx = slots.findIndex(sl => sl.time === input.time && (!Number.isInteger(input.slotIndex) || sl.slotIndex == null));
  if (tIdx < 0) throw new TdError(404, 'slot-not-found', 'That time is no longer on the schedule. Please choose another open slot.');
  const target = slots[tIdx];
  if (!isSlotTdOpen(target)) throw new TdError(409, 'slot-taken', 'That slot is no longer open. Please choose another open slot.');
  if (isPastSlot(sunday.date, target, now)) throw new TdError(409, 'slot-past', 'That slot is in the past. Please choose an upcoming open slot.');

  const first = mine[0].rec;
  const householdName = String(first.household).trim();
  const householdId = String(first.householdId || '').trim();
  const withMembers = mine.find(e => e.rec.members);
  const members = withMembers ? withMembers.rec.members : '';
  const emailOnFile = (mine.find(e => emailsOf(e.rec.email).includes(typed)) || mine[0]).rec.email;
  let interviewTypes = Array.isArray(first.interviewTypes) ? [...first.interviewTypes] : ['TD'];
  let meetingNote = first.meetingNote || '';
  // Clear the household's current scheduled slot (same fields the /td page used to clear), first one in schedule order.
  let from = null;
  const cur = mine.find(e => e.kind === 'slot');
  if (cur) {
    const sl = next.sundays[cur.si].slots[cur.i];
    if (Array.isArray(sl.interviewTypes)) interviewTypes = [...sl.interviewTypes];
    if (sl.meetingNote) meetingNote = sl.meetingNote;
    from = { date: next.sundays[cur.si].date, time: sl.time, title: next.sundays[cur.si].title || '' };
    Object.assign(sl, { available: true, tdOpen: true, isNonTdIndividual: false, status: 'open', household: '', householdId: '', members: '', email: '', meetingNote: '', interviewTypes: [] });
    delete sl.missedDate; delete sl.missedTime;
  }
  let unassignedChanged = false;
  if (Array.isArray(next.unassigned)) {
    const before = next.unassigned.length;
    next.unassigned = next.unassigned.filter(u => {
      const id = String((u && u.householdId) || '').trim();
      const k = id ? `id:${id}` : `n:${normalizeSurname(u && u.household)}`;
      return k !== key;
    });
    unassignedChanged = next.unassigned.length !== before;
  }
  Object.assign(target, {
    available: false, tdOpen: true, isNonTdIndividual: false, status: 'scheduled', household: householdName,
    householdId, members, email: emailOnFile, meetingNote,
    interviewTypes: interviewTypes.includes('TD') ? interviewTypes : ['TD', ...interviewTypes]
  });
  recount(next);
  return { next, unassignedChanged, household: householdName, from, to: { date: sunday.date, time: target.time, title: sunday.title || '' } };
}

async function rateCheck(tx, ref, limit) {
  const snap = await tx.get(ref);
  const n = snap.exists ? Number(snap.data().count || 0) : 0;
  return { n, over: n >= limit };
}

function makeHandler({ db, admin, setCorsHeaders, isAllowedOrigin, now = () => new Date() }) {
  return async (req, res) => {
    setCorsHeaders(req, res);
    if (req.method === 'OPTIONS') return res.status(204).send('');
    const send = (status, body) => res.status(status).json(body);
    if (req.method !== 'POST') return send(405, { ok: false, code: 'method-not-allowed', message: 'Use POST.' });
    if (req.headers.origin && !isAllowedOrigin(req.headers.origin)) return send(403, { ok: false, code: 'origin', message: 'Not allowed from this site.' });
    const b = req.body && typeof req.body === 'object' ? req.body : {};
    const action = b.action === 'check' ? 'check' : b.action === 'move' ? 'move' : '';
    const household = typeof b.household === 'string' ? b.household.trim().slice(0, 80) : '';
    if (!action || !household) return send(400, { ok: false, code: 'bad-request', message: 'Please enter your household / family name.' });
    const t = now();
    const ipRef = db.collection(RATE_COLLECTION).doc(sha(`ip|${clientIp(req)}|${hourBucket(t)}`));
    const expiresAt = Timestamp.fromMillis(t.getTime() + 2 * 3600 * 1000);
    try {
      const ipOver = await db.runTransaction(async (tx) => {
        const r = await rateCheck(tx, ipRef, RATE_PER_IP_PER_HOUR);
        if (!r.over) tx.set(ipRef, { count: r.n + 1, kind: 'ip', expiresAt }, { merge: true });
        return r.over;
      });
      if (ipOver) return send(429, { ok: false, code: 'rate-limited', message: 'Too many tries. Please wait an hour and try again, or contact the bishopric.' });
    } catch (e) { console.error('td rate check failed', e && e.code); }

    const mainRef = db.collection(TD_COLLECTION).doc(`tithing_declaration_${TD_YEAR}`);
    if (action === 'check') {
      const snap = await mainRef.get();
      const c = snap.exists ? candidatesFor(snap.data(), household) : [];
      if (!c.length) return send(404, { ok: false, code: 'unknown-household', message: 'We could not find that family name on the schedule.' });
      return send(200, { ok: true, household: String(c[0].rec.household).trim() });
    }
    const email = typeof b.email === 'string' ? b.email.trim().slice(0, 254) : '';
    const date = typeof b.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.date) ? b.date : '';
    const time = typeof b.time === 'string' ? b.time.trim().slice(0, 40) : '';
    const slotIndex = Number.isInteger(b.slotIndex) && b.slotIndex >= 0 && b.slotIndex < 1000 ? b.slotIndex : null;
    if (!email || !email.includes('@')) return send(400, { ok: false, code: 'bad-request', message: 'Please enter the household email on file.' });
    if (!date || !time) return send(400, { ok: false, code: 'bad-request', message: 'Please select an open slot.' });

    let failRef = null;
    try {
      const out = await db.runTransaction(async (tx) => {
        const snap = await tx.get(mainRef);
        const data = snap.exists ? snap.data() : null;
        // lockout check for this household (after repeated wrong emails) before anything else
        const cands = data ? candidatesFor(data, household) : [];
        if (cands.length) {
          failRef = db.collection(RATE_COLLECTION).doc(sha(`hh|${cands[0].key}|${hourBucket(t)}`));
          const f = await tx.get(failRef);
          if (f.exists && Number(f.data().count || 0) >= BAD_EMAIL_PER_HOUSEHOLD_PER_HOUR) {
            throw new TdError(429, 'rate-limited', `Too many attempts for this household. Please wait an hour and try again, or ${CONTACT_MSG.charAt(0).toLowerCase()}${CONTACT_MSG.slice(1)}`);
          }
        }
        const plan = planMove(data, { household, email, date, time, slotIndex }, t);
        const update = {
          sundays: plan.next.sundays, totalScheduled: plan.next.totalScheduled, totalOpenSlots: plan.next.totalOpenSlots,
          updatedBy: `td-member-reschedule:${plan.household}`, updatedAtIso: t.toISOString()
        };
        if (plan.unassignedChanged) update.unassigned = plan.next.unassigned;
        tx.update(mainRef, update);
        tx.set(db.collection(TD_PUBLIC_COLLECTION).doc(TD_YEAR), publicView({ ...data, ...update }, TD_YEAR));
        return plan;
      });
      return send(200, { ok: true, household: out.household, from: out.from, to: out.to });
    } catch (e) {
      if (e instanceof TdError) {
        if (e.code === 'email-mismatch' && failRef) {
          try { await failRef.set({ count: FieldValue.increment(1), kind: 'household', expiresAt }, { merge: true }); } catch (_) { }
        }
        return send(e.status, { ok: false, code: e.code, message: e.message });
      }
      console.error('tdReschedule failed', e && (e.code || e.message));
      return send(500, { ok: false, code: 'server-error', message: 'Something went wrong. Please try again, or contact the bishopric.' });
    }
  };
}

function makeSync({ db }) {
  return async (event) => {
    const m = TD_DOC_RE.exec(event.params.docId || '');
    if (!m) return;
    const ref = db.collection(TD_PUBLIC_COLLECTION).doc(m[1]);
    const after = event.data && event.data.after && event.data.after.exists ? event.data.after.data() : null;
    if (!after) { await ref.delete(); return; }
    await ref.set(publicView(after, m[1]));
  };
}

module.exports = { makeHandler, makeSync, publicView, planMove, candidatesFor, isSlotTdOpen, isSlotTdInterview, TdError, TD_DOC_RE };
