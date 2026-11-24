'use strict';
// changeRequestNotify: on a new or closed change_requests doc, queue a mail doc for the
// Trigger Email extension. FAKE-data unit tests import buildMailsForEvent / findClerkLeaders.
// Do not log member names or email addresses.

const CLERK_RC = 'RC5';
const HUB_LINK = 'https://bish.blackstoneward.org/';
const FROM_HINT = 'The Blackstone Ward Bishopric Hub';

function isActiveClerk(d) {
  if (!d || d.active === false) return false;
  return Array.isArray(d.rcCodes) && d.rcCodes.includes(CLERK_RC);
}

function mailDoc(to, subject, html) {
  return { to, message: { subject, html } };
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function requestBody(data, requestId) {
  const target = `${data.targetType || ''} ${data.targetId || ''}`.trim();
  const text = escapeHtml(data.proposedChange || '');
  return `<p>${FROM_HINT} has a directory change request.</p>
<p><strong>Target:</strong> ${escapeHtml(target)}<br>
<strong>Request id:</strong> ${escapeHtml(requestId || '')}<br>
<strong>Requested by:</strong> ${escapeHtml(data.requesterName || 'a leader')}</p>
<p><strong>Proposed change:</strong><br>${text.replace(/\n/g, '<br>')}</p>
<p><a href="${HUB_LINK}">Open the Bishopric Hub Directory</a> to review.</p>`;
}

/**
 * @param {'create'|'closed'} kind
 * @param {object} after
 * @param {object|null} before
 * @param {object} ctx { clerks: [{email}], requesterEmail }
 * @returns {Array<{to,message}>}
 */
function buildMailsForEvent(kind, after, before, ctx, requestId) {
  const mails = [];
  if (!after) return mails;
  if (kind === 'create') {
    const clerks = (ctx.clerks || []).filter((c) => c && c.email);
    for (const c of clerks) {
      mails.push(mailDoc(
        c.email,
        'Directory change request (open)',
        requestBody(after, requestId)
      ));
    }
    return mails;
  }
  if (kind === 'closed') {
    const wasOpen = (before && before.status === 'open');
    const nowClosed = after.status === 'done_lcr' || after.status === 'declined';
    if (!wasOpen || !nowClosed) return mails;
    const to = ctx.requesterEmail;
    if (!to) return mails;
    const result = after.status === 'done_lcr' ? 'Done in LCR' : 'Declined';
    mails.push(mailDoc(
      to,
      `Directory change request ${result}`,
      `<p>Your directory change request was marked <strong>${escapeHtml(result)}</strong>.</p>
${requestBody(after, requestId)}
${after.resolutionNote ? `<p><strong>Note:</strong> ${escapeHtml(after.resolutionNote)}</p>` : ''}`
    ));
    return mails;
  }
  return mails;
}

function eventKind(before, after) {
  if (!after) return null;
  if (!before) return 'create';
  if (before.status === 'open' && (after.status === 'done_lcr' || after.status === 'declined')) return 'closed';
  return null;
}

async function findClerkLeaders(db) {
  const snap = await db.collection('ward_leaders').get();
  const clerks = [];
  snap.forEach((doc) => {
    const d = doc.data() || {};
    if (isActiveClerk(d) && d.email) clerks.push({ id: doc.id, email: d.email });
  });
  return clerks;
}

async function lookupRequesterEmail(db, after) {
  if (after && after.requesterEmail) return after.requesterEmail;
  const uid = after && after.requesterUid;
  if (!uid) return '';
  const doc = await db.collection('ward_leaders').doc(uid).get();
  if (doc.exists && doc.data() && doc.data().email) return doc.data().email;
  return '';
}

async function handleChangeRequestWritten(change, db) {
  const after = change.after && change.after.exists ? change.after.data() : null;
  const before = change.before && change.before.exists ? change.before.data() : null;
  const kind = eventKind(before, after);
  if (!kind) return { wrote: 0, kind: null };
  const clerks = kind === 'create' ? await findClerkLeaders(db) : [];
  const requesterEmail = kind === 'closed' ? await lookupRequesterEmail(db, after) : '';
  const mails = buildMailsForEvent(kind, after, before, { clerks, requesterEmail }, change.after && change.after.id);
  for (const m of mails) await db.collection('mail').add(m);
  return { wrote: mails.length, kind };
}

function makeHandler({ db }) {
  return async (event) => {
    const change = event.data || event;
    try {
      return await handleChangeRequestWritten(change, db);
    } catch (err) {
      console.error('changeRequestNotify failed');
      throw err;
    }
  };
}

module.exports = {
  CLERK_RC,
  buildMailsForEvent,
  eventKind,
  isActiveClerk,
  findClerkLeaders,
  lookupRequesterEmail,
  handleChangeRequestWritten,
  makeHandler
};
