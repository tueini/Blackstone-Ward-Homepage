'use strict';
// Email via SendGrid, same sender as BW_Youth/functions/index.js L30-31 (hub@blackstoneward.org,
// 'Blackstone Ward Hub'). replyTo = the event organizer's email. The API key comes only from the Functions
// secret SENDGRID_API_KEY (referenced by name; never logged). In the emulator mail is written to
// signup_test_mail (emulator-only collection) and nothing is sent.
const { esc } = require('./util');

const FROM = { email: 'hub@blackstoneward.org', name: 'Blackstone Ward Hub' };
const TZ = 'America/New_York';

function when(iso) {
  if (!iso) return '';
  try { return `${new Date(iso).toLocaleString('en-US', { timeZone: TZ, dateStyle: 'full', timeStyle: 'short' })} ET`; } catch (_) { return iso; }
}

function makeSendGridMailer() {
  let sg = null;
  return async (msg) => {
    if (!sg) {
      const key = (process.env.SENDGRID_API_KEY || '').trim();
      if (!key) throw new Error('SENDGRID_API_KEY secret is not configured for this function.');
      sg = require('@sendgrid/mail');
      sg.setApiKey(key);
    }
    const out = { from: FROM, to: msg.to, subject: msg.subject, text: msg.text, html: msg.html };
    if (msg.replyTo) out.replyTo = msg.replyTo;
    await sg.send(out);
  };
}

function makeEmulatorMailer(db) {
  return async (msg) => {
    await db.collection('signup_test_mail').add({ from: FROM, ...msg, at: new Date().toISOString() });
  };
}

function makeMailer(db) {
  return process.env.FUNCTIONS_EMULATOR === 'true' ? makeEmulatorMailer(db) : makeSendGridMailer();
}

function shell(title, bodyHtml) {
  return `<div style="font-family:Arial,Helvetica,sans-serif;background:#FAF6EF;padding:20px;color:#152548">`
    + `<div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:22px">`
    + `<h2 style="margin:0 0 12px;font-size:20px">${esc(title)}</h2>${bodyHtml}`
    + `<p style="color:#64748b;font-size:12px;margin-top:22px">Blackstone Ward. Reply to this email to reach the organizer.</p></div></div>`;
}

function eventLines(ev) {
  const lines = [];
  if (ev.starts_at) lines.push(`When: ${when(ev.starts_at)}`);
  if (ev.location) lines.push(`Where: ${ev.location}`);
  return lines;
}

function confirmationEmail({ ev, to, firstName, items, rsvp, link, replyTo, changed }) {
  const head = changed ? 'Your sign-up was updated' : "You're signed up";
  const lines = [...eventLines(ev)];
  items.forEach((i) => lines.push(`- ${i.title}: ${i.quantity}`));
  if (rsvp) lines.push(`RSVP: ${rsvp.response.toUpperCase()}${rsvp.response === 'yes' ? ` (${rsvp.adult_count + rsvp.guest_count} total, including ${rsvp.guest_count} guest${rsvp.guest_count === 1 ? '' : 's'})` : ''}`);
  const text = `Hi ${firstName},\n\n${head} for ${ev.title}.\n\n${lines.join('\n')}\n\nChange or cancel: ${link}\n(This personal link is only for you. Do not forward it.)\n`;
  const html = shell(`${head}: ${ev.title}`, `<p>Hi ${esc(firstName)},</p><p>${lines.map(esc).join('<br>')}</p>`
    + `<p><a href="${esc(link)}" style="display:inline-block;background:#152548;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Change or cancel my sign-up</a></p>`
    + `<p style="font-size:12px;color:#64748b">This personal link is only for you. Please don't forward it.</p>`);
  return { to, replyTo, subject: `${head}: ${ev.title}`, text, html };
}

function cancelEmail({ ev, to, firstName, replyTo }) {
  const text = `Hi ${firstName},\n\nYour sign-up for ${ev.title} was canceled.\n`;
  return { to, replyTo, subject: `Canceled: ${ev.title}`, text, html: shell(`Canceled: ${ev.title}`, `<p>Hi ${esc(firstName)},</p><p>Your sign-up for ${esc(ev.title)} was canceled.</p>`) };
}

function inviteEmail({ ev, to, link, expiresAt, replyTo }) {
  const lines = eventLines(ev);
  const text = `You're invited to ${ev.title}.\n\n${lines.join('\n')}\n\nView and sign up: ${link}\nThis personal invitation link expires ${when(expiresAt)}.\n`;
  const html = shell(`You're invited: ${ev.title}`, `<p>${lines.map(esc).join('<br>')}</p>`
    + `<p><a href="${esc(link)}" style="display:inline-block;background:#152548;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">View and sign up</a></p>`
    + `<p style="font-size:12px;color:#64748b">This personal invitation link expires ${esc(when(expiresAt))}. Please don't forward it.</p>`);
  return { to, replyTo, subject: `You're invited: ${ev.title}`, text, html };
}

function reminderEmail({ ev, to, firstName, items, rsvp, replyTo }) {
  const lines = [...eventLines(ev)];
  items.forEach((i) => lines.push(`- ${i.title}: ${i.quantity}`));
  if (rsvp) lines.push(`RSVP: ${rsvp.response.toUpperCase()}`);
  const text = `Hi ${firstName},\n\nA reminder about ${ev.title}.\n\n${lines.join('\n')}\n\nTo change or cancel, use the link in your confirmation email.\n`;
  return { to, replyTo, subject: `Reminder: ${ev.title}`, text, html: shell(`Reminder: ${ev.title}`, `<p>Hi ${esc(firstName)},</p><p>${lines.map(esc).join('<br>')}</p><p>To change or cancel, use the link in your confirmation email.</p>`) };
}

module.exports = { makeMailer, makeSendGridMailer, makeEmulatorMailer, confirmationEmail, cancelEmail, inviteEmail, reminderEmail, when, FROM };
