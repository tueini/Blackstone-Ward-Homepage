// Blackstone Ward sign-up sheet (participant page), Signup Phase 1, Home 1.2.96.
// blackstoneward.org/signup/<event-slug>. No participant accounts. Passcode is posted once and remembered by an
// httpOnly cookie set by the server; invite (#i=) and edit (#edit=) tokens arrive in the URL fragment (never sent
// to servers in logs/referrers), are kept in sessionStorage for this tab and removed from the address bar.
import { api, auth, el, fmtWhen, SIGNUP_VERSION } from "./signup-client.js?v=1.2.96";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const main = document.getElementById("su-main");
const m = location.pathname.match(/^\/signup\/([a-z0-9-]{1,80})\/?$/);
const slug = m ? m[1] : "";
const NAME_PLACEHOLDER = "Enter First & Last Name (e.g. Mahonri Moriancumer)";
const EMAIL_PLACEHOLDER = "e.g. mahonri.moriancumer@example.com";

(function takeTokensFromHash() {
  if (!slug || !location.hash) return;
  const p = new URLSearchParams(location.hash.slice(1));
  if (p.get("edit")) sessionStorage.setItem(`su_edit_${slug}`, p.get("edit"));
  if (p.get("i")) sessionStorage.setItem(`su_invite_${slug}`, p.get("i"));
  history.replaceState(null, "", location.pathname);
})();
const inviteToken = () => sessionStorage.getItem(`su_invite_${slug}`) || "";
const editToken = () => sessionStorage.getItem(`su_edit_${slug}`) || "";

function show(...nodes) { main.replaceChildren(...nodes); }
function card(...kids) { return el("div", { class: "su-card" }, ...kids); }
function banner(kind, text) { return el("div", { class: `su-banner ${kind}`, role: kind === "bad" ? "alert" : "status", text }); }
function message(title, text, kind = "info") { show(card(el("h1", { text: title }), banner(kind, text))); }

function setRobots(ev) {
  const meta = document.getElementById("su-robots");
  if (ev && ev.noindex === false && ev.access_level === "public" && meta) meta.remove();
}

function header(ev) {
  const kids = [el("h1", { text: ev.title }), el("p", { class: "su-muted", text: fmtWhen(ev.starts_at, ev.ends_at) })];
  if (ev.location) kids.push(el("p", { class: "su-muted", text: `Where: ${ev.location}` }));
  if (ev.organizer_name) kids.push(el("p", { class: "su-muted", text: `Organizer: ${ev.organizer_name}` }));
  if (ev.description) kids.push(el("p", { class: "su-desc", text: ev.description }));
  if (ev.assets && ev.assets.length) {
    const grid = el("div", { class: "su-assets" });
    for (const a of ev.assets) {
      if (a.kind === "image") grid.append(el("figure", {}, el("img", { src: a.url, alt: a.caption || "Event image", loading: "lazy", referrerpolicy: "no-referrer" }), a.caption ? el("figcaption", { class: "su-muted", text: a.caption }) : null));
      else grid.append(el("p", {}, el("a", { href: a.url, target: "_blank", rel: "noopener noreferrer", text: a.filename || a.caption || "Attachment" }), a.caption && a.filename ? el("span", { class: "su-muted", text: ` – ${a.caption}` }) : null));
    }
    kids.push(grid);
  }
  if (ev.ended) kids.push(banner("warn", "This event has ended."));
  else if (!ev.open) kids.push(banner("warn", "Sign-ups for this event are closed."));
  return card(...kids);
}

function namesLine(names, unit) {
  if (!names || !names.length) return null;
  return el("div", { class: "su-names", text: names.map((n) => (n[unit] > 1 ? `${n.name} (${n[unit]})` : n.name)).join(", ") });
}

function slotsTable(ev, mine = {}) {
  const rows = ev.slots.map((s) => {
    const have = mine[s.id] || 0;
    const max = Math.min(500, s.remaining + have);
    const qty = el("input", { type: "number", class: "su-qty", min: "0", max: String(max), value: String(have), "data-slot": s.id, "aria-label": `How many for ${s.title}`, disabled: !ev.open || max === 0 });
    return el("tr", {},
      el("td", {}, el("strong", { text: s.title }), s.help_comment ? el("div", { class: "su-muted", text: s.help_comment }) : null, namesLine(s.names, "quantity")),
      el("td", { text: s.remaining > 0 ? `${s.remaining} of ${s.quantity_wanted} left` : "Full" }),
      el("td", {}, qty));
  });
  return el("table", { class: "su-table" }, el("thead", {}, el("tr", {}, el("th", { text: "Item" }), el("th", { text: "Still needed" }), el("th", { text: "I'll bring" }))), el("tbody", {}, rows));
}

function rsvpFields(ev, cur) {
  const r = ev.rsvp;
  const wrap = el("fieldset", { class: "su-card", style: "margin:0 0 12px" }, el("legend", { class: "su-label", text: "Will you come?" }));
  const radios = el("div", { class: "su-radios" });
  for (const [v, label] of [["yes", "Yes"], ["maybe", "Maybe"], ["no", "No"], ["", cur ? "Remove my RSVP" : "No RSVP"]]) {
    if (v === "" && !cur && ev.type === "rsvp") continue;
    radios.append(el("label", { class: "su-check" }, el("input", { type: "radio", name: "su-rsvp", value: v, checked: (cur ? cur.response : "") === v || (!cur && v === "yes" && ev.type === "rsvp") }), label));
  }
  wrap.append(radios);
  const row = el("div", { class: "su-row" },
    el("div", { class: "su-field" }, el("label", { for: "su-adults", text: "People in your family coming" }), el("input", { type: "number", id: "su-adults", min: "1", max: "20", value: String(cur && cur.adult_count ? cur.adult_count : 1) })));
  if (ev.allow_guests && ev.guest_cap > 0) row.append(el("div", { class: "su-field" }, el("label", { for: "su-guests", text: `Guests (up to ${ev.guest_cap})` }), el("input", { type: "number", id: "su-guests", min: "0", max: String(ev.guest_cap), value: String(cur ? cur.guest_count : 0) })));
  wrap.append(row);
  wrap.append(el("p", { class: "su-muted", text: r.remaining > 0 ? `${r.remaining} spot${r.remaining === 1 ? "" : "s"} left (${r.yes_headcount} of ${r.headcount_cap} coming).` : `This event is full (${r.headcount_cap} coming).` }));
  const nl = namesLine(r.names, "headcount");
  if (nl) wrap.append(el("div", {}, el("span", { class: "su-label", text: "Coming: " }), nl));
  return wrap;
}

function readRsvp(form) {
  const picked = form.querySelector('input[name="su-rsvp"]:checked');
  if (!picked || !picked.value) return null;
  const v = picked.value;
  if (v === "no") return { response: "no" };
  const g = form.querySelector("#su-guests");
  return { response: v, adult_count: Number(form.querySelector("#su-adults").value || 1), guest_count: g ? Number(g.value || 0) : 0 };
}
function readItems(form, includeZero) {
  return [...form.querySelectorAll("input[data-slot]")].map((i) => ({ slot_id: i.dataset.slot, quantity: Number(i.value || 0) })).filter((x) => includeZero || x.quantity > 0);
}

function renderEvent(ev) {
  setRobots(ev);
  document.title = `${ev.title} — Blackstone Ward`;
  const nodes = [header(ev)];
  if (ev.open) {
    const remembered = JSON.parse(localStorage.getItem("su_remember") || "null");
    const status = el("div");
    const form = el("form", { class: "su-card", novalidate: true }, el("h2", { text: "Sign up" }));
    if (ev.slots && ev.slots.length) form.append(slotsTable(ev));
    if (ev.rsvp) form.append(rsvpFields(ev, null));
    form.append(
      el("div", { class: "su-row" },
        el("div", { class: "su-field" }, el("label", { for: "su-name", text: "Your name" }), el("input", { type: "text", id: "su-name", required: true, autocomplete: "name", placeholder: NAME_PLACEHOLDER, value: remembered ? remembered.name : "" })),
        el("div", { class: "su-field" }, el("label", { for: "su-email", text: "Email (for your confirmation and change link)" }), el("input", { type: "email", id: "su-email", required: true, autocomplete: "email", placeholder: EMAIL_PLACEHOLDER, value: remembered ? remembered.email : "" }))),
      el("div", { class: "su-field" }, el("label", { for: "su-comment", text: "Comment (optional)" }), el("textarea", { id: "su-comment", maxlength: "500" })),
      el("label", { class: "su-check" }, el("input", { type: "checkbox", id: "su-youth" }), "This sign-up is for a youth (ages 12–18). Please use a parent or guardian's email."),
      el("label", { class: "su-check" }, el("input", { type: "checkbox", id: "su-remember", checked: !!remembered }), "Remember my name and email on this device"),
      el("div", { class: "su-hp", "aria-hidden": "true" }, el("label", { for: "su-website", text: "Leave this empty" }), el("input", { type: "text", id: "su-website", name: "website", tabindex: "-1", autocomplete: "off" })),
      el("p", { class: "su-muted", text: "This page shows only first names and last initials. Your full name and email are seen only by the event organizers." }),
      status,
      el("div", { class: "su-actions" }, el("button", { type: "submit", class: "su-btn", text: "Sign up" })));
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = form.querySelector("button[type=submit]");
      const name = form.querySelector("#su-name").value.trim();
      const email = form.querySelector("#su-email").value.trim();
      if (form.querySelector("#su-remember").checked) localStorage.setItem("su_remember", JSON.stringify({ name, email }));
      else localStorage.removeItem("su_remember");
      btn.disabled = true;
      const r = await api("/public/submit", {
        slug, invite: inviteToken(), name, email, comment: form.querySelector("#su-comment").value,
        is_youth: form.querySelector("#su-youth").checked, website: form.querySelector("#su-website").value,
        items: readItems(form, false), rsvp: ev.rsvp ? readRsvp(form) : null,
      });
      btn.disabled = false;
      if (r.ok) {
        show(header(ev), card(el("h2", { text: "Thank you! You're signed up." }), banner("ok", "Check your email for a confirmation with a personal link to change or cancel your sign-up."),
          el("div", { class: "su-actions" }, el("button", { type: "button", class: "su-btn secondary", text: "Back to the sign-up", onclick: load }))));
        window.scrollTo(0, 0);
      } else {
        status.replaceChildren(banner("bad", r.message || "Something went wrong."));
        if (r.status === 409) { const fresh = await api("/public/event", { slug, invite: inviteToken() }); if (fresh.ok) { renderEvent(fresh.event); main.querySelector("form")?.prepend(banner("bad", r.message)); } }
      }
    });
    nodes.push(form);
  } else if ((ev.slots && ev.slots.length) || ev.rsvp) {
    const c = card(el("h2", { text: "Sign-ups" }));
    if (ev.slots && ev.slots.length) c.append(slotsTable(ev));
    if (ev.rsvp) c.append(el("p", { class: "su-muted", text: `${ev.rsvp.yes_headcount} coming.` }));
    nodes.push(c);
  }
  show(...nodes);
}

function renderPasscode(text) {
  const status = el("div");
  const form = el("form", { class: "su-card" }, el("h1", { text: "Enter the passcode" }),
    el("p", { class: "su-muted", text: text || "This sign-up is for ward members. The organizer shared the passcode by ward email, group text or announcement." }),
    el("div", { class: "su-field" }, el("label", { for: "su-pass", text: "Passcode" }), el("input", { type: "password", id: "su-pass", autocomplete: "off", required: true })),
    status, el("div", { class: "su-actions" }, el("button", { type: "submit", class: "su-btn", text: "Continue" })));
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const r = await api("/public/passcode", { slug, passcode: form.querySelector("#su-pass").value });
    if (r.ok) renderEvent(r.event);
    else status.replaceChildren(banner("bad", r.message || "That passcode did not work."));
  });
  show(form);
  form.querySelector("#su-pass").focus();
}

function renderManage(ev, mine) {
  setRobots(ev);
  document.title = `${ev.title} — My sign-up`;
  if (mine.canceled) {
    show(header(ev), card(el("h2", { text: "Your sign-up was canceled" }), el("p", { class: "su-muted", text: "Nothing is reserved under this link anymore." }),
      ev.open ? el("div", { class: "su-actions" }, el("button", { class: "su-btn", text: "Sign up again", onclick: () => { sessionStorage.removeItem(`su_edit_${slug}`); load(); } })) : null));
    return;
  }
  const mineBySlot = Object.fromEntries(mine.items.map((i) => [i.slot_id, i.quantity]));
  const status = el("div");
  const form = el("form", { class: "su-card" }, el("h2", { text: "My sign-up" }), el("p", { class: "su-muted", text: `${mine.name} · ${mine.email}` }));
  if (!ev.open) form.append(banner("warn", "Sign-ups are closed, so changes are no longer possible."));
  if (ev.slots && ev.slots.length) form.append(slotsTable(ev, mineBySlot));
  if (ev.rsvp) form.append(rsvpFields(ev, mine.rsvp));
  form.append(el("div", { class: "su-field" }, el("label", { for: "su-comment", text: "Comment" }), el("textarea", { id: "su-comment", maxlength: "500" }, mine.comment)), status);
  if (ev.open) {
    form.append(el("div", { class: "su-actions" }, el("button", { type: "submit", class: "su-btn", text: "Save changes" }),
      el("button", { type: "button", class: "su-btn danger", text: "Cancel my sign-up", onclick: async () => {
        if (!confirm("Cancel your whole sign-up for this event?")) return;
        const r = await api("/public/manage/cancel", { token: editToken() });
        if (r.ok) load(); else status.replaceChildren(banner("bad", r.message));
      } })));
  }
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = { token: editToken(), items: readItems(form, true), comment: form.querySelector("#su-comment").value };
    if (ev.rsvp) body.rsvp = readRsvp(form);
    const r = await api("/public/manage/update", body);
    if (r.ok) { await load(); main.querySelector("form")?.prepend(banner("ok", "Saved. We emailed you the updated details.")); }
    else status.replaceChildren(banner("bad", r.message || "Could not save."));
  });
  show(header(ev), form);
}

async function load() {
  if (!slug) { message("Ward sign-ups", "Open the sign-up link you were sent (it looks like blackstoneward.org/signup/…)."); return; }
  if (editToken()) {
    const r = await api("/public/manage", { token: editToken() });
    if (r.ok) { renderManage(r.event, r.mine); return; }
    sessionStorage.removeItem(`su_edit_${slug}`);
    message("This link didn't work", r.message || "Please use the link in your most recent confirmation email.", "bad");
    return;
  }
  const r = await api("/public/event", { slug, invite: inviteToken() });
  if (r.ok) renderEvent(r.event);
  else if (r.needs === "passcode") renderPasscode(r.message && r.message.includes("not open") ? r.message : "");
  else if (r.needs === "invite") message("By invitation", r.message, "warn");
  else if (r.status === 404) message("Sign-up not found", "Check the link, or ask the organizer for a new one.", "warn");
  else message("Something went wrong", r.message || "Please try again in a minute.", "bad");
}

document.getElementById("su-version").textContent = `Version ${SIGNUP_VERSION}`;
load();

// Leader tools: only when this browser already has a ward-leader sign-in (from /activities or /admin). The server
// decides; participants never get the pane, and nothing is requested without a sign-in.
onAuthStateChanged(auth, (user) => {
  if (!user || !slug) return;
  import("./signup-admin.js?v=1.2.96").then((mod) => mod.mountAdmin({ slug, user, reload: load })).catch(() => {});
});
