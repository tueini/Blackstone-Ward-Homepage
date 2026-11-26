// Blackstone Ward sign-ups (Signup Phase 1, Home 1.2.96): shared browser helpers for /signup and /activities.
// The browser never reads or writes Firestore for sign-ups: every call goes to the signupApi Function through
// the same-origin Hosting rewrite /api/signup/** (so the passcode cookie stays httpOnly on this site).
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

export const SIGNUP_VERSION = "1.2.96";

const firebaseConfig = {
  apiKey: "AIzaSyDrWB07WNqObtjiZb_NntJQZ0dhHyLRBas",
  authDomain: "blackstoneward-b861c.firebaseapp.com",
  projectId: "blackstoneward-b861c",
  storageBucket: "blackstoneward-b861c.firebasestorage.app",
  messagingSenderId: "609425206588",
  appId: "1:609425206588:web:99ae3cb602c82e212dc239",
  measurementId: "G-0T68YN4Y2P"
};
export const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);

export async function api(route, body = {}, idToken = "") {
  const headers = { "Content-Type": "application/json" };
  if (idToken) headers.Authorization = `Bearer ${idToken}`;
  let res;
  try {
    res = await fetch(`/api/signup${route}`, { method: "POST", headers, body: JSON.stringify(body), credentials: "same-origin", cache: "no-store" });
  } catch (_) {
    return { ok: false, status: 0, error: "network", message: "Could not reach the server. Check your connection and try again." };
  }
  let data = {};
  try { data = await res.json(); } catch (_) { data = {}; }
  return { status: res.status, ...data, ok: res.ok && data.ok !== false };
}

// Tiny DOM builder: text is always set with textContent (never innerHTML).
export function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "class") n.className = v;
    else if (k === "text") n.textContent = v;
    else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
    else if (v === true) n.setAttribute(k, "");
    else n.setAttribute(k, String(v));
  }
  for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) n.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  return n;
}

const TZ = "America/New_York";
export function fmtWhen(startIso, endIso) {
  if (!startIso) return "Date to be announced";
  const s = new Date(startIso);
  const day = s.toLocaleDateString("en-US", { timeZone: TZ, weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const t1 = s.toLocaleTimeString("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" });
  if (!endIso) return `${day}, ${t1}`;
  const e = new Date(endIso);
  const sameDay = e.toLocaleDateString("en-US", { timeZone: TZ }) === s.toLocaleDateString("en-US", { timeZone: TZ });
  const t2 = e.toLocaleTimeString("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" });
  return sameDay ? `${day}, ${t1} – ${t2}` : `${day}, ${t1} – ${e.toLocaleString("en-US", { timeZone: TZ, dateStyle: "medium", timeStyle: "short" })}`;
}
export function fmtShort(iso) {
  return iso ? new Date(iso).toLocaleString("en-US", { timeZone: TZ, dateStyle: "medium", timeStyle: "short" }) : "";
}
// datetime-local <-> ISO (the input shows the browser's local time).
export function toLocalInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
export function fromLocalInput(v) { return v ? new Date(v).toISOString() : null; }

export const TYPE_LABELS = { slots: "Item sign-up", rsvp: "RSVP", slots_plus_rsvp: "RSVP + item sign-up" };
export const LEVEL_LABELS = { public: "Public link", passcode: "Passcode", invite_only: "Invite only" };
export const STATUS_LABELS = { draft: "Draft", published: "Published", closed: "Closed" };

export function downloadText(filename, text, type = "text/csv") {
  const blob = new Blob([text], { type });
  const a = el("a", { href: URL.createObjectURL(blob), download: filename });
  document.body.append(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
