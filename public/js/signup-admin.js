// Sheet admin view (Signup Phase 1, Home 1.2.96). Loaded by signup.js only when this browser has a Firebase
// sign-in; shown only when the signupApi Function confirms the leader may manage this event (area 22, or a ward
// admin). Participant names and contacts appear only with area 23 (or ward admin). Participants never see it.
import { api, el, fmtShort, toLocalInput, fromLocalInput, downloadText, TYPE_LABELS, LEVEL_LABELS, STATUS_LABELS } from "./signup-client.js?v=1.2.96";

const pane = document.getElementById("su-admin");
let ctx = null;

const field = (label, input, hint) => el("div", { class: "su-field" }, el("label", { text: label }), input, hint ? el("span", { class: "su-muted", text: hint }) : null);
const select = (id, options, value) => el("select", { id }, Object.entries(options).map(([v, t]) => el("option", { value: v, selected: v === value, text: t })));
const check = (id, label, checked) => el("label", { class: "su-check" }, el("input", { type: "checkbox", id, checked: !!checked }), label);
const note = (kind, text) => el("div", { class: `su-banner ${kind}`, text });

async function call(route, body) {
  const token = await ctx.user.getIdToken();
  return api(route, { event_id: ctx.slug, ...body }, token);
}
function flash(where, r, okText) {
  where.replaceChildren(r.ok ? note("ok", okText) : note("bad", r.message || "Something went wrong."));
}

export async function mountAdmin({ slug, user, reload }) {
  ctx = { slug, user, reload };
  await render();
}

async function render() {
  const token = await ctx.user.getIdToken();
  const r = await api("/admin/events/get", { event_id: ctx.slug }, token);
  if (!r.ok) { pane.hidden = true; pane.replaceChildren(); return; }
  const { event: ev, slots, access, participants, invites, org, co_organizers: coOrgs, ward_admin: wardAdmin } = r;
  const out = [];
  out.push(el("div", { class: "su-card" },
    el("h2", {}, "Leader tools ", el("span", { class: `su-pill ${ev.status}`, text: STATUS_LABELS[ev.status] || ev.status })),
    el("p", { class: "su-muted", text: `Only signed-in organizers see this section. ${org.name} · ${LEVEL_LABELS[ev.access_level]} · /signup/${ev.id}` }),
    ev.status === "draft" ? note("warn", "Draft: participants can't see this sign-up yet. Publish it when it's ready.") : null,
    ev.purged_at ? note("info", "Personal sign-up data for this event was removed after the retention period.") : null,
    statusButtons(ev),
    el("p", {}, el("a", { href: "/activities/", text: "← Back to Ward Activities sign-ups" }))));
  if (!ev.purged_at) out.push(detailsCard(ev, slots, org));
  if (access.contacts && participants) out.push(peopleCard(ev, participants));
  else out.push(el("div", { class: "su-card" }, el("h2", { text: "Participants" }), note("info", "Names and contacts need Restricted Area 23 (Activity sign-ups).")));
  if (access.contacts && invites && !ev.purged_at) out.push(invitesCard(ev, invites));
  out.push(coOrgCard(ev, coOrgs));
  out.push(templateCard(ev, wardAdmin));
  pane.replaceChildren(...out);
  pane.hidden = false;
}

function statusButtons(ev) {
  const status = el("div");
  const btn = (label, s, cls = "su-btn small") => el("button", { type: "button", class: cls, text: label, onclick: async () => {
    const r = await call("/admin/events/status", { status: s });
    flash(status, r, `Status: ${STATUS_LABELS[s]}`);
    if (r.ok) { await render(); ctx.reload(); }
  } });
  const row = el("div", { class: "su-actions" });
  if (ev.status !== "published" && !ev.purged_at) row.append(btn("Publish", "published"));
  if (ev.status === "published") row.append(btn("Close sign-ups", "closed", "su-btn small secondary"));
  if (ev.status !== "draft" && !ev.purged_at) row.append(btn("Back to draft", "draft", "su-btn small secondary"));
  return el("div", {}, row, status);
}

function slotRow(s) {
  const tr = el("tr", { "data-id": s.id || "" },
    el("td", {}, el("input", { type: "text", class: "slot-title", value: s.title || "", maxlength: "120", "aria-label": "Item" })),
    el("td", {}, el("input", { type: "text", class: "slot-help", value: s.help_comment || "", maxlength: "200", "aria-label": "Note" })),
    el("td", {}, el("input", { type: "number", class: "su-qty slot-qty", min: String(Math.max(1, s.filled || 0)), max: "500", value: String(s.quantity_wanted || 1), "aria-label": "Quantity wanted" })),
    el("td", { text: String(s.filled || 0) }));
  tr.append(el("td", {}, (s.filled || 0) > 0 ? el("span", { class: "su-muted", text: "in use" }) : el("button", { type: "button", class: "su-btn small danger", text: "Remove", onclick: () => tr.remove() })));
  return tr;
}
function assetRow(a) {
  const tr = el("tr", {},
    el("td", {}, select("", { image: "Image", attachment: "Attachment" }, a.kind || "image")),
    el("td", {}, el("input", { type: "url", class: "as-url", value: a.url || "", placeholder: "https://…" })),
    el("td", {}, el("input", { type: "text", class: "as-name", value: a.filename || "", placeholder: "File name" })),
    el("td", {}, el("input", { type: "text", class: "as-cap", value: a.caption || "", placeholder: "Caption" })),
    el("td", {}, el("label", { class: "su-check" }, el("input", { type: "checkbox", class: "as-consent", checked: !!a.consent }), "No people, or consent obtained")));
  tr.append(el("td", {}, el("button", { type: "button", class: "su-btn small danger", text: "Remove", onclick: () => tr.remove() })));
  return tr;
}

function detailsCard(ev, slots, org) {
  const status = el("div");
  const slotBody = el("tbody", {}, slots.map(slotRow));
  const assetBody = el("tbody", {}, (ev.assets || []).map(assetRow));
  const passStatus = el("div");
  const passInput = el("input", { type: "password", id: "ad-pass", autocomplete: "new-password", placeholder: "New passcode (4+ characters)" });
  const form = el("form", { class: "su-card" },
    el("h2", { text: "Event details" }),
    field("Title", el("input", { type: "text", id: "ad-title", value: ev.title, maxlength: "120", required: true })),
    field("Description", el("textarea", { id: "ad-desc", maxlength: "4000" }, ev.description || "")),
    el("div", { class: "su-row" },
      field("Location", el("input", { type: "text", id: "ad-loc", value: ev.location || "", maxlength: "200" })),
      field("Type", select("ad-type", TYPE_LABELS, ev.type))),
    el("div", { class: "su-row" },
      field("Starts", el("input", { type: "datetime-local", id: "ad-start", value: toLocalInput(ev.starts_at) })),
      field("Ends", el("input", { type: "datetime-local", id: "ad-end", value: toLocalInput(ev.ends_at) })),
      field("Sign-ups close (optional)", el("input", { type: "datetime-local", id: "ad-close", value: toLocalInput(ev.close_at) }))),
    el("div", { class: "su-row" },
      field("Organizer name", el("input", { type: "text", id: "ad-org-name", value: ev.organizer_name || "", maxlength: "80", placeholder: "Enter First & Last Name (e.g. Mahonri Moriancumer)" })),
      field("Organizer email (replies go here)", el("input", { type: "email", id: "ad-org-email", value: ev.organizer_email || "", placeholder: "e.g. mahonri.moriancumer@example.com" }))),
    el("h3", { text: "Who can see it" }),
    el("div", { class: "su-row" },
      field("Access", select("ad-level", LEVEL_LABELS, ev.access_level), "Public: anyone with the link. Passcode: link + shared passcode. Invite only: personal emailed links."),
      field("Reminder email (days before, 0 = none)", el("input", { type: "number", id: "ad-remind", min: "0", max: "14", value: String(ev.reminder_days_before || 0) }))),
    check("ad-noindex", "Hide from search engines (recommended; always on for passcode and invite-only)", ev.noindex !== false),
    check("ad-hide", "Hide participant names on the sheet (show counts only)", ev.hide_names),
    el("h3", { text: "RSVP" }),
    el("div", { class: "su-row" },
      field("Headcount cap (Yes + guests)", el("input", { type: "number", id: "ad-cap", min: "1", max: "5000", value: ev.headcount_cap ? String(ev.headcount_cap) : "" })),
      field("Guests per RSVP", el("input", { type: "number", id: "ad-gcap", min: "0", max: "50", value: String(ev.guest_cap || 0) }))),
    check("ad-guests", "Allow guests", ev.allow_guests),
    el("h3", { text: "Items (quantity is a hard cap)" }),
    el("table", { class: "su-table" }, el("thead", {}, el("tr", {}, ["Item", "Note", "Wanted", "Signed up", ""].map((h) => el("th", { text: h })))), slotBody),
    el("div", { class: "su-actions" }, el("button", { type: "button", class: "su-btn small secondary", text: "+ Add item", onclick: () => slotBody.append(slotRow({ quantity_wanted: 1 })) })),
    el("h3", { text: "Images and attachments (links)" }),
    el("p", { class: "su-muted", text: "Use a https link (for example a shared Google Drive file). Get consent before posting photos of people." }),
    el("table", { class: "su-table" }, el("tbody", {}, assetBody)),
    el("div", { class: "su-actions" }, el("button", { type: "button", class: "su-btn small secondary", text: "+ Add image or attachment", onclick: () => assetBody.append(assetRow({})) })),
    el("h3", { text: "Keep personal data" }),
    field("Days after the event (30–90; blank = ward default of 60)", el("input", { type: "number", id: "ad-ret", min: "30", max: "90", value: ev.retention_days ? String(ev.retention_days) : "" })),
    status,
    el("div", { class: "su-actions" }, el("button", { type: "submit", class: "su-btn", text: "Save changes" })),
    el("h3", { text: "Passcode" }),
    note("info", "A passcode is light friction to keep casual outsiders out. It is not strong security. Share it by ward email, group text or announcements; never put it in a link. Changing it signs out every device that remembered the old one."),
    el("p", { class: "su-muted", text: ev.has_own_passcode ? "This event has its own passcode." : (org.has_default_passcode ? "Using the organization's default passcode." : "No passcode set yet.") }),
    el("div", { class: "su-row" }, el("div", { class: "su-field" }, passInput)),
    el("div", { class: "su-actions" },
      el("button", { type: "button", class: "su-btn small", text: "Set event passcode", onclick: async () => {
        const r = await call("/admin/events/passcode", { passcode: passInput.value });
        passInput.value = ""; flash(passStatus, r, "Passcode saved."); if (r.ok) render();
      } }),
      ev.has_own_passcode ? el("button", { type: "button", class: "su-btn small secondary", text: "Use organization default", onclick: async () => {
        const r = await call("/admin/events/passcode", { passcode: null }); flash(passStatus, r, "Now using the organization default."); if (r.ok) render();
      } }) : null),
    passStatus);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const q = (id) => form.querySelector(`#${id}`);
    const fields = {
      title: q("ad-title").value, description: q("ad-desc").value, location: q("ad-loc").value, type: q("ad-type").value,
      starts_at: fromLocalInput(q("ad-start").value), ends_at: fromLocalInput(q("ad-end").value), close_at: fromLocalInput(q("ad-close").value),
      organizer_name: q("ad-org-name").value, organizer_email: q("ad-org-email").value, access_level: q("ad-level").value,
      reminder_days_before: Number(q("ad-remind").value || 0), noindex: q("ad-noindex").checked, hide_names: q("ad-hide").checked,
      headcount_cap: q("ad-cap").value ? Number(q("ad-cap").value) : null, guest_cap: Number(q("ad-gcap").value || 0), allow_guests: q("ad-guests").checked,
      retention_days: q("ad-ret").value ? Number(q("ad-ret").value) : null,
      assets: [...assetBody.querySelectorAll("tr")].map((tr) => ({ kind: tr.querySelector("select").value, url: tr.querySelector(".as-url").value, filename: tr.querySelector(".as-name").value, caption: tr.querySelector(".as-cap").value, consent: tr.querySelector(".as-consent").checked })),
    };
    const slotsOut = [...slotBody.querySelectorAll("tr")].map((tr) => ({ id: tr.dataset.id || null, title: tr.querySelector(".slot-title").value, help_comment: tr.querySelector(".slot-help").value, quantity_wanted: Number(tr.querySelector(".slot-qty").value || 1) }));
    const r = await call("/admin/events/save", { fields, slots: slotsOut });
    flash(status, r, "Saved.");
    if (r.ok) { await render(); ctx.reload(); }
  });
  return form;
}

function peopleCard(ev, people) {
  const status = el("div");
  const active = people.filter((p) => !p.canceled_at);
  const rows = people.map((p) => el("tr", { style: p.canceled_at ? "opacity:.5" : "" },
    el("td", { text: p.kind === "rsvp" ? `RSVP ${p.response}${p.response === "yes" ? ` (${p.adult_count}+${p.guest_count})` : ""}` : `${p.slot_title} × ${p.quantity}` }),
    el("td", { text: `${p.first_name} ${p.last_name}${p.is_youth ? " (youth)" : ""}` }),
    el("td", { text: p.email }),
    el("td", { text: p.comment }),
    el("td", { text: p.canceled_at ? (p.removed_by_leader ? "removed" : "canceled") : fmtShort(p.created_at) }),
    el("td", {}, p.canceled_at ? null : el("button", { type: "button", class: "su-btn small danger", text: "Remove", onclick: async () => {
      if (!confirm("Remove this entry? It frees the item or headcount.")) return;
      const r = await call("/admin/entries/delete", { kind: p.kind, id: p.id }); flash(status, r, "Removed."); if (r.ok) { await render(); ctx.reload(); }
    } }))));
  const c = ev.rsvp_counts || {};
  return el("div", { class: "su-card" },
    el("h2", { text: `Participants (${active.length} active)` }),
    ev.type !== "slots" ? el("p", { class: "su-muted", text: `RSVP: ${c.yes || 0} yes (${c.yes_headcount || 0} people incl. guests of ${ev.headcount_cap || "—"}), ${c.maybe || 0} maybe, ${c.no || 0} no.` }) : null,
    el("table", { class: "su-table" }, el("thead", {}, el("tr", {}, ["Entry", "Name", "Email", "Comment", "When", ""].map((h) => el("th", { text: h })))), el("tbody", {}, rows)),
    status,
    el("div", { class: "su-actions" },
      el("button", { type: "button", class: "su-btn small secondary", text: "Export CSV", onclick: async () => {
        const r = await call("/admin/export", {}); if (r.ok) downloadText(r.filename, r.csv); else flash(status, r, "");
      } }),
      ev.status === "published" ? el("button", { type: "button", class: "su-btn small secondary", text: "Send reminder email now", onclick: async () => {
        if (!confirm("Email a reminder to everyone signed up?")) return;
        const r = await call("/admin/reminders/send", {}); flash(status, r, `Reminder emailed to ${r.emailed || 0} people.`);
      } }) : null));
}

function invitesCard(ev, invites) {
  const status = el("div");
  const box = el("textarea", { id: "ad-invites", placeholder: "One email per line. For youth, use the parent or guardian's email." });
  const rows = invites.map((i) => el("tr", {},
    el("td", { text: i.email }),
    el("td", { text: i.revoked_at ? "revoked" : (i.active ? (i.used_at ? "used" : "active") : "expired") }),
    el("td", { text: `expires ${fmtShort(new Date(i.expires_at).toISOString())}` }),
    el("td", {}, i.active ? el("span", {},
      el("button", { type: "button", class: "su-btn small secondary", text: "Expire", onclick: async () => { const r = await call("/admin/invites/revoke", { invite_id: i.id, mode: "expire" }); flash(status, r, "Expired."); if (r.ok) render(); } }), " ",
      el("button", { type: "button", class: "su-btn small danger", text: "Revoke", onclick: async () => { const r = await call("/admin/invites/revoke", { invite_id: i.id }); flash(status, r, "Revoked."); if (r.ok) render(); } })) : null)));
  return el("div", { class: "su-card" },
    el("h2", { text: "Invites" }),
    ev.access_level !== "invite_only" ? note("info", "Invites matter only when Access is 'Invite only'. Each person gets a personal link; don't share the passcode as an invite.") : null,
    field("Email invitations", box),
    el("div", { class: "su-actions" },
      el("button", { type: "button", class: "su-btn small", text: "Send invites", onclick: async () => {
        const emails = box.value.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);
        const r = await call("/admin/invites/create", { emails }); flash(status, r, `Invited ${r.invited || 0} (${r.emailed || 0} emailed).`); if (r.ok) render();
      } }),
      invites.some((i) => i.active) ? el("button", { type: "button", class: "su-btn small danger", text: "Revoke all invites", onclick: async () => {
        if (!confirm("Revoke every invite for this event?")) return;
        const r = await call("/admin/invites/revoke", { all: true }); flash(status, r, `Revoked ${r.changed || 0}.`); if (r.ok) render();
      } }) : null),
    status,
    invites.length ? el("table", { class: "su-table" }, el("tbody", {}, rows)) : null);
}

function coOrgCard(ev, coOrgs) {
  const status = el("div");
  const pick = el("select", { id: "ad-co" }, el("option", { value: "", text: "Choose a leader…" }));
  ctx.user.getIdToken().then((t) => api("/admin/leaders", { org_id: ev.org_id }, t)).then((r) => {
    if (r.ok) r.leaders.forEach((l) => pick.append(el("option", { value: l.id, text: l.name })));
  });
  return el("div", { class: "su-card" },
    el("h2", { text: "Co-organizers for this event" }),
    el("p", { class: "su-muted", text: "They can manage this event once signed in. Seeing names and contacts still needs Restricted Area 23 (or ward admin)." }),
    el("ul", {}, coOrgs.map((c) => el("li", {}, `${c.name} `, el("button", { type: "button", class: "su-btn small secondary", text: "Remove", onclick: async () => {
      const r = await call("/admin/events/coorganizers/remove", { user_id: c.user_id }); flash(status, r, "Removed."); if (r.ok) render();
    } })))),
    el("div", { class: "su-actions" }, pick, el("button", { type: "button", class: "su-btn small", text: "Add", onclick: async () => {
      if (!pick.value) return; const r = await call("/admin/events/coorganizers/add", { user_id: pick.value }); flash(status, r, "Added."); if (r.ok) render();
    } })), status);
}

function templateCard(ev, wardAdmin) {
  const status = el("div");
  const name = el("input", { type: "text", value: ev.title, maxlength: "80", "aria-label": "Template name" });
  const wide = el("input", { type: "checkbox" });
  return el("div", { class: "su-card" },
    el("h2", { text: "Templates and copies" }),
    el("p", { class: "su-muted", text: "A template saves the title, description, items, defaults and access level. It never includes sign-ups, passcodes or invites. Later template edits never change this event." }),
    field("Template name", name),
    wardAdmin ? el("label", { class: "su-check" }, wide, "Ward-wide template (all organizations)") : null,
    el("div", { class: "su-actions" },
      el("button", { type: "button", class: "su-btn small", text: "Save as template", onclick: async () => {
        const r = await call("/admin/templates/save_from_event", { name: name.value, ward_wide: wide.checked }); flash(status, r, "Template saved.");
      } }),
      el("button", { type: "button", class: "su-btn small secondary", text: "Duplicate event", onclick: async () => {
        const r = await call("/admin/events/duplicate", {}); if (r.ok) location.href = `/signup/${r.event_id}`; else flash(status, r, "");
      } })),
    status);
}
