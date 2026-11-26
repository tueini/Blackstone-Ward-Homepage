// Ward Activities sign-ups, Restricted Area 22 (Signup Phase 1, Home 1.2.96): blackstoneward.org/activities.
// Sign-in reuses the existing leader sign-in (passkey via passkeyApi, or SMS text code); a Firebase session from
// /admin or /music on this site is reused. The signupApi Function decides access from the ward_leaders record
// (RC52 Ward Activity Committee Leader for ward_activities; ward admins RC1-RC6 for everything).
import { api, auth, el, fmtShort, TYPE_LABELS, LEVEL_LABELS, STATUS_LABELS, SIGNUP_VERSION } from "./signup-client.js?v=1.2.96";
import { RecaptchaVerifier, signInWithPhoneNumber, signInWithCustomToken, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { loginWithCloudPasskey } from "./passkey-client.js?v=1.2.96";

const $ = (id) => document.getElementById(id);
const gate = $("act-gate"); const appEl = $("act-app"); const loading = $("act-loading");
const note = (kind, text) => el("div", { class: `su-banner ${kind}`, text });
let me = null; let currentOrg = null; let confirmation = null;
$("act-version").textContent = `Version ${SIGNUP_VERSION}`;

async function call(route, body = {}) {
  const u = auth.currentUser;
  if (!u) return { ok: false, status: 401, message: "Please sign in." };
  return api(route, body, await u.getIdToken());
}
function flash(where, r, okText) { where.replaceChildren(r.ok ? note("ok", okText) : note("bad", r.message || "Something went wrong.")); }

function showGate(msg) {
  loading.classList.add("su-hidden"); appEl.classList.add("su-hidden"); gate.classList.remove("su-hidden"); $("act-signout").classList.add("su-hidden");
  $("act-gate-status").replaceChildren(msg ? note("bad", msg) : "");
}

onAuthStateChanged(auth, async (user) => {
  if (!user) { showGate(""); return; }
  const r = await call("/admin/me");
  if (!r.ok) {
    await signOut(auth).catch(() => {});
    showGate(r.status === 403 ? "This sign-in is not authorized for Ward Activities sign-ups. Ask the bishopric if you need access." : (r.message || "Could not check your sign-in."));
    return;
  }
  me = r;
  currentOrg = (r.orgs.find((o) => o.id === "ward_activities") || r.orgs[0] || {}).id || null;
  loading.classList.add("su-hidden"); gate.classList.add("su-hidden"); appEl.classList.remove("su-hidden"); $("act-signout").classList.remove("su-hidden");
  renderApp();
});
$("act-signout").addEventListener("click", () => signOut(auth));

// ---- sign-in: passkey ----
$("act-passkey").addEventListener("click", async () => {
  const hint = $("act-passkey-hint");
  hint.classList.add("su-hidden");
  if (!window.PublicKeyCredential) { hint.textContent = "Passkeys aren't supported in this browser. Use a text message below."; hint.classList.remove("su-hidden"); return; }
  try {
    const result = await loginWithCloudPasskey({ leaderName: "" });
    if (result && result.verified && result.customToken) await signInWithCustomToken(auth, result.customToken);
    else throw new Error("no token");
  } catch (err) {
    if (err && err.name === "AbortError") return;
    hint.textContent = "No passkey found on this device yet. Use a text message below."; hint.classList.remove("su-hidden");
  }
});
// ---- sign-in: SMS ----
function e164(raw) { const d = String(raw || "").replace(/\D/g, ""); if (d.length === 10) return `+1${d}`; if (d.length === 11 && d[0] === "1") return `+${d}`; return ""; }
$("act-sms-back").addEventListener("click", () => { $("act-sms-step-2").classList.add("su-hidden"); $("act-sms-step-1").classList.remove("su-hidden"); });
$("act-sms-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const st = $("act-gate-status");
  if (!$("act-sms-step-2").classList.contains("su-hidden")) {
    const code = $("act-code").value.replace(/\D/g, "");
    if (code.length !== 6 || !confirmation) { st.replaceChildren(note("bad", "Enter the 6-digit code.")); return; }
    try { await confirmation.confirm(code); } catch (_) { st.replaceChildren(note("bad", "That code is wrong or expired.")); }
    return;
  }
  const phone = e164($("act-phone").value);
  if (!phone) { st.replaceChildren(note("bad", "Enter a 10-digit mobile number.")); return; }
  try {
    if (window.actRecaptcha) { try { window.actRecaptcha.clear(); } catch (_) {} }
    $("act-recaptcha").replaceChildren();
    window.actRecaptcha = new RecaptchaVerifier(auth, "act-recaptcha", { size: "invisible" });
    confirmation = await signInWithPhoneNumber(auth, phone, window.actRecaptcha);
    $("act-sms-step-1").classList.add("su-hidden"); $("act-sms-step-2").classList.remove("su-hidden");
    $("act-sms-sent").textContent = `Code sent to ${phone}.`; $("act-code").focus(); st.replaceChildren();
  } catch (err) { st.replaceChildren(note("bad", "Could not send the code. Check the number, or use a passkey.")); }
});

// ---- app ----
async function renderApp() {
  const orgs = me.orgs.filter((o) => o.enabled || me.ward_admin);
  const head = el("div", { class: "su-card" },
    el("h1", { text: "Ward Activities sign-ups" }),
    el("p", { class: "su-muted", text: `Signed in as ${me.leader.name}${me.ward_admin ? " (ward admin)" : ""}.` }),
    orgs.length > 1 ? el("div", { class: "su-field" }, el("label", { text: "Organization" }), el("select", { onchange: (ev) => { currentOrg = ev.target.value; renderApp(); } },
      [el("option", { value: "__all__", selected: currentOrg === "__all__", text: "All organizations (ward admin index)" }), ...orgs.map((o) => el("option", { value: o.id, selected: o.id === currentOrg, text: `${o.name}${o.enabled ? "" : " (not turned on yet)"}` }))])) : null);
  const parts = [head, await eventsCard(), await createCard()];
  const org = me.orgs.find((o) => o.id === currentOrg);
  if (org) { parts.push(orgPasscodeCard(org)); if (org.can_assign) parts.push(await assignCard(org)); }
  parts.push(await templatesCard());
  appEl.replaceChildren(...parts);
}

async function eventsCard() {
  const r = await call("/admin/events/list", currentOrg && currentOrg !== "__all__" ? { org_id: currentOrg } : {});
  const c = el("div", { class: "su-card" }, el("h2", { text: currentOrg === "__all__" ? "All events" : "Events" }));
  if (!r.ok) { c.append(note("bad", r.message)); return c; }
  if (!r.events.length) { c.append(el("p", { class: "su-muted", text: "No events yet. Create one below (try the Ward picnic template)." })); return c; }
  const status = el("div");
  c.append(el("table", { class: "su-table" },
    el("thead", {}, el("tr", {}, ["Event", "When", "Type / access", "Status", ""].map((h) => el("th", { text: h })))),
    el("tbody", {}, r.events.map((e) => el("tr", {},
      el("td", {}, el("a", { href: `/signup/${e.id}`, text: e.title }), currentOrg === "__all__" ? el("div", { class: "su-muted", text: e.org_id }) : null),
      el("td", { text: e.starts_at ? fmtShort(e.starts_at) : "—" }),
      el("td", { text: `${TYPE_LABELS[e.type] || e.type} · ${LEVEL_LABELS[e.access_level] || e.access_level}` }),
      el("td", {}, el("span", { class: `su-pill ${e.status}`, text: e.purged ? "Closed (data removed)" : (STATUS_LABELS[e.status] || e.status) }), e.type !== "slots" ? el("div", { class: "su-muted", text: `${e.rsvp_counts.yes_headcount} coming` }) : null),
      el("td", {}, el("a", { class: "su-btn small secondary", href: `/signup/${e.id}`, text: "Open sheet" }), " ",
        el("button", { type: "button", class: "su-btn small secondary", text: "Duplicate", onclick: async () => {
          const d = await call("/admin/events/duplicate", { event_id: e.id }); flash(status, d, "Copied as a new draft."); if (d.ok) renderApp();
        } })))))), status);
  return c;
}

async function createCard() {
  const org = me.orgs.find((o) => o.id === currentOrg && o.enabled && o.can_manage);
  const c = el("div", { class: "su-card" }, el("h2", { text: "Create an event" }));
  if (!org) { c.append(el("p", { class: "su-muted", text: "Pick an organization that is turned on (Phase 1: Ward Activities Committee)." })); return c; }
  const t = await call("/admin/templates/list");
  const tpl = el("select", {}, el("option", { value: "", text: "Blank event" }), ...(t.ok ? t.templates : []).map((x) => el("option", { value: x.id, text: `${x.name}${x.org_id ? "" : " (ward-wide)"}` })));
  const type = el("select", {}, Object.entries(TYPE_LABELS).map(([v, l]) => el("option", { value: v, selected: v === "slots_plus_rsvp", text: l })));
  const title = el("input", { type: "text", maxlength: "120", placeholder: "Title (optional when using a template)" });
  const status = el("div");
  c.append(el("div", { class: "su-row" },
    el("div", { class: "su-field" }, el("label", { text: "Start from" }), tpl),
    el("div", { class: "su-field" }, el("label", { text: "Type (blank event)" }), type),
    el("div", { class: "su-field" }, el("label", { text: "Title" }), title)),
    el("p", { class: "su-muted", text: `New events start as drafts with ${LEVEL_LABELS[org.default_access_level]} access (you can change it). You'll finish editing on the sheet itself.` }),
    el("div", { class: "su-actions" }, el("button", { type: "button", class: "su-btn", text: "Create draft and open sheet", onclick: async () => {
      const r = await call("/admin/events/create", { org_id: org.id, template_id: tpl.value || undefined, type: type.value, title: title.value });
      if (r.ok) location.href = `/signup/${r.event_id}`; else flash(status, r, "");
    } })), status);
  return c;
}

function orgPasscodeCard(org) {
  const status = el("div");
  const input = el("input", { type: "password", autocomplete: "new-password", placeholder: "New default passcode (4+ characters)" });
  return el("div", { class: "su-card" },
    el("h2", { text: `${org.name}: default passcode` }),
    note("info", "Passcode-level events without their own passcode use this one. It's light friction to keep casual outsiders out, not strong security. Share it by ward email, group text or announcements; never in a link. Changing it signs out every device that remembered the old one."),
    el("p", { class: "su-muted", text: org.has_default_passcode ? "A default passcode is set." : "No default passcode yet." }),
    org.can_assign ? el("div", {}, el("div", { class: "su-field" }, input), el("div", { class: "su-actions" },
      el("button", { type: "button", class: "su-btn small", text: "Save default passcode", onclick: async () => {
        const r = await call("/admin/orgs/passcode", { org_id: org.id, passcode: input.value }); input.value = ""; flash(status, r, "Saved."); if (r.ok) { org.has_default_passcode = true; }
      } }),
      org.has_default_passcode ? el("button", { type: "button", class: "su-btn small secondary", text: "Remove default", onclick: async () => {
        const r = await call("/admin/orgs/passcode", { org_id: org.id, passcode: null }); flash(status, r, "Removed."); if (r.ok) org.has_default_passcode = false;
      } }) : null)) : el("p", { class: "su-muted", text: "Only the organization leader or a ward admin can change it." }),
    status);
}

async function assignCard(org) {
  const status = el("div");
  const [list, leaders] = await Promise.all([call("/admin/orgs/assignments/list", { org_id: org.id }), call("/admin/leaders", { org_id: org.id })]);
  const pick = el("select", {}, el("option", { value: "", text: "Choose a leader…" }), ...(leaders.ok ? leaders.leaders : []).map((l) => el("option", { value: l.id, text: l.name })));
  const role = el("select", {}, el("option", { value: "co_organizer", text: "Co-organizer" }), me.ward_admin ? el("option", { value: "leader", text: "Organization leader" }) : null);
  return el("div", { class: "su-card" },
    el("h2", { text: `${org.name}: co-organizers` }),
    el("p", { class: "su-muted", text: "Co-organizers can create and manage this organization's events. Seeing participant names and contacts also needs Restricted Area 23 on their calling (ward admins always can)." }),
    el("ul", {}, (list.ok ? list.assignments : []).map((a) => el("li", {}, `${a.name} — ${a.role === "leader" ? "leader" : "co-organizer"} `,
      el("button", { type: "button", class: "su-btn small secondary", text: "Remove", onclick: async () => { const r = await call("/admin/orgs/assignments/remove", { org_id: org.id, user_id: a.user_id }); flash(status, r, "Removed."); if (r.ok) renderApp(); } })))),
    el("div", { class: "su-actions" }, pick, role, el("button", { type: "button", class: "su-btn small", text: "Add", onclick: async () => {
      if (!pick.value) return; const r = await call("/admin/orgs/assignments/add", { org_id: org.id, user_id: pick.value, role: role.value }); flash(status, r, "Added."); if (r.ok) renderApp();
    } })), status);
}

async function templatesCard() {
  const r = await call("/admin/templates/list");
  const status = el("div");
  const c = el("div", { class: "su-card" }, el("h2", { text: "Templates" }),
    el("p", { class: "su-muted", text: "Create an event from a template above. To make a template, open an event's sheet and use “Save as template”. Editing or deleting a template never changes events already made from it." }));
  if (!r.ok) { c.append(note("bad", r.message)); return c; }
  c.append(el("table", { class: "su-table" }, el("tbody", {}, r.templates.map((t) => el("tr", {},
    el("td", { text: t.name }), el("td", { text: t.org_id ? t.org_id : "ward-wide" }), el("td", { text: `${TYPE_LABELS[t.type] || t.type} · ${t.slots} items` }),
    el("td", {}, t.builtin ? el("span", { class: "su-muted", text: "starter" }) : (t.can_delete ? el("button", { type: "button", class: "su-btn small danger", text: "Delete", onclick: async () => {
      if (!confirm(`Delete the template "${t.name}"?`)) return; const d = await call("/admin/templates/delete", { template_id: t.id }); flash(status, d, "Deleted."); if (d.ok) renderApp();
    } }) : null)))))), status);
  return c;
}
