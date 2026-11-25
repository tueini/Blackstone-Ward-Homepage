/*! Blackstone Ward shared name picker (BW_Platform). Vendored into each hub; do not edit the copies. */
const MAX_SUGGESTIONS = 20;
const OTHER_NAME_FIELDS = ["name", "nameKey", "note", "firstUsedAt", "lastUsedAt", "useCount", "usedIn", "linkedMemberId", "createdBy", "updatedBy"];

export function normalizeNameKey(s) {
  const t = String(s || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  return t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, "-");
}

export function displayName(m) {
  if (!m) return "";
  if (m.name) return String(m.name).trim();
  return `${m.firstName || ""} ${m.lastName || ""}`.replace(/\s+/g, " ").trim();
}

/** Br for male, Sr for female, from the stored gender value. Missing gender: no prefix. */
export function genderPrefix(gender) {
  const g = String(gender || "").trim().toLowerCase();
  if (g === "m" || g === "male") return "Br";
  if (g === "f" || g === "female") return "Sr";
  return "";
}

/** (A), (Y) or (P) only. Other groups and a missing group: no suffix. */
export function groupSuffix(group) {
  const g = String(group || "").trim().toUpperCase();
  if (g === "A" || g === "Y" || g === "P") return `(${g})`;
  return "";
}

/** Display-only label for a ward member, e.g. "Br Ada Example (A)". Saved text stays displayName(m). */
export function wardDisplayName(m) {
  const base = displayName(m);
  if (!base) return "";
  const pre = genderPrefix(m && m.gender);
  const suf = groupSuffix(m && m.group);
  return `${pre ? pre + " " : ""}${base}${suf ? " " + suf : ""}`;
}

/** Display-only label for a non-ward name, e.g. "Stake Visitor (O)". No Br/Sr prefix. */
export function otherDisplayName(name) {
  const base = String(name || "").replace(/\s+/g, " ").trim();
  return base ? `${base} (O)` : "";
}

export function otherPromptText(typed) {
  return `Use ${String(typed || "").replace(/\s+/g, " ").trim()} as non-ward entry`;
}

export function stripDisplayDecorations(s) {
  let t = String(s || "").replace(/\s+/g, " ").trim();
  t = t.replace(/^(Br|Sr)\s+/, "");
  t = t.replace(/\s+\(([AYPO])\)$/, "");
  return t.trim();
}

export function displayValueForRef(ref, directory) {
  if (!ref) return "";
  if (ref.source === "ward") {
    const id = ref.memberId;
    const m = (directory && Array.isArray(directory.members))
      ? directory.members.find((x) => (x.memberId || x.id) === id)
      : null;
    return m ? wardDisplayName(m) : (ref.name || "");
  }
  if (ref.source === "other") return otherDisplayName(ref.name);
  return ref.name || "";
}

export function sortMembers(a, b) {
  const ln = String(a.lastName || "").localeCompare(String(b.lastName || ""), undefined, { sensitivity: "base" });
  if (ln) return ln;
  return String(a.firstName || "").localeCompare(String(b.firstName || ""), undefined, { sensitivity: "base" });
}

function fold(s) {
  return String(s || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

export function memberMatchesQuery(m, query) {
  const q = fold(query);
  if (!q) return true;
  const first = fold(m.firstName);
  const last = fold(m.lastName);
  const full = `${first} ${last}`.trim();
  const flipped = `${last}, ${first}`;
  const q2 = fold(stripDisplayDecorations(query));
  const labeled = fold(wardDisplayName(m));
  return first.startsWith(q) || last.startsWith(q) || full.startsWith(q) || flipped.startsWith(q) || full.includes(q) || last.includes(q)
    || (q2 && (first.startsWith(q2) || last.startsWith(q2) || full.startsWith(q2) || flipped.startsWith(q2) || full.includes(q2)))
    || (labeled && (labeled.startsWith(q) || labeled.includes(q)));
}

export function filterMembers(members, query, { groups } = {}) {
  const list = Array.isArray(members) ? members.slice() : [];
  const allowed = Array.isArray(groups) && groups.length ? new Set(groups) : null;
  return list
    .filter((m) => !allowed || allowed.has(m.group))
    .filter((m) => memberMatchesQuery(m, query))
    .sort(sortMembers);
}

export function filterOtherNames(others, query) {
  const q = fold(query);
  const list = Array.isArray(others) ? others.slice() : [];
  return list
    .filter((o) => !q || fold(o.name).includes(q) || normalizeNameKey(o.name).includes(normalizeNameKey(query)))
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), undefined, { sensitivity: "base" }));
}

export function exactMemberMatch(members, query, { groups } = {}) {
  const q = fold(query);
  if (!q) return null;
  const plain = fold(stripDisplayDecorations(query));
  const hits = filterMembers(members, plain || query, { groups }).filter((m) => {
    const dn = fold(displayName(m));
    const flipped = fold(`${m.lastName}, ${m.firstName}`);
    const labeled = fold(wardDisplayName(m));
    return dn === q || dn === plain || flipped === q || flipped === plain || labeled === q;
  });
  return hits.length === 1 ? hits[0] : null;
}

/**
 * Load the names-only directory (leaders can read members/households with the live rules).
 * other_names may be empty until the phase-4 rules are deployed.
 */
export async function loadDirectory(fsApi) {
  const { db, collection, getDocs } = fsApi;
  const members = [];
  const households = [];
  const otherNames = [];
  let otherNamesReadable = false;
  const memSnap = await getDocs(collection(db, "members"));
  memSnap.forEach((d) => members.push({ id: d.id, ...d.data(), memberId: d.id }));
  members.sort(sortMembers);
  const hhSnap = await getDocs(collection(db, "households"));
  hhSnap.forEach((d) => households.push({ id: d.id, ...d.data(), householdId: d.id }));
  households.sort((a, b) => String(a.householdName || "").localeCompare(String(b.householdName || ""), undefined, { sensitivity: "base" }));
  try {
    const otSnap = await getDocs(collection(db, "other_names"));
    otherNamesReadable = true;
    otSnap.forEach((d) => otherNames.push({ id: d.id, ...d.data() }));
  } catch (_) {
    otherNamesReadable = false;
  }
  return { members, households, otherNames, otherNamesReadable, loadedAt: Date.now() };
}

export async function upsertOtherName(fsApi, { name, note, uid, hub, page }) {
  const { db, doc, getDoc, setDoc, serverTimestamp } = fsApi;
  const display = String(name || "").replace(/\s+/g, " ").trim();
  const nameKey = normalizeNameKey(display);
  if (!nameKey) throw new Error("other_name_empty");
  const ref = doc(db, "other_names", nameKey);
  const prev = await getDoc(ref);
  const used = { hub: hub || "", page: page || "", date: new Date().toISOString().slice(0, 10) };
  if (!prev.exists()) {
    await setDoc(ref, {
      name: display,
      nameKey,
      note: String(note || ""),
      firstUsedAt: serverTimestamp(),
      lastUsedAt: serverTimestamp(),
      useCount: 1,
      usedIn: [used],
      linkedMemberId: null,
      createdBy: uid,
      updatedBy: uid
    });
  } else {
    const data = prev.data() || {};
    const usedIn = Array.isArray(data.usedIn) ? data.usedIn.slice(-19) : [];
    usedIn.push(used);
    const patch = {
      lastUsedAt: serverTimestamp(),
      useCount: Number(data.useCount || 0) + 1,
      usedIn,
      updatedBy: uid
    };
    if (note && !data.note) patch.note = String(note);
    await setDoc(ref, patch, { merge: true });
  }
  return { otherId: nameKey, name: display, source: "other" };
}

export function refFromMember(m) {
  return { source: "ward", memberId: m.memberId || m.id, otherId: null, name: displayName(m) };
}

export function refFromOther(o) {
  return { source: "other", memberId: null, otherId: o.otherId || o.id || normalizeNameKey(o.name), name: o.name };
}

export function getInputRef(inputEl) {
  if (!inputEl) return null;
  const source = inputEl.dataset.npSource || "";
  if (!source) return null;
  return {
    source,
    memberId: inputEl.dataset.npMemberId || null,
    otherId: inputEl.dataset.npOtherId || null,
    name: (inputEl.dataset.npPlainName || "").trim()
  };
}

export function setInputRef(inputEl, ref, directory) {
  if (!inputEl) return;
  if (!ref) {
    delete inputEl.dataset.npSource;
    delete inputEl.dataset.npMemberId;
    delete inputEl.dataset.npOtherId;
    delete inputEl.dataset.npPlainName;
    return;
  }
  const plain = (ref.name || "").trim();
  inputEl.dataset.npSource = ref.source || "";
  inputEl.dataset.npMemberId = ref.memberId || "";
  inputEl.dataset.npOtherId = ref.otherId || "";
  inputEl.dataset.npPlainName = plain;
  const shown = displayValueForRef(ref, directory) || plain;
  if (shown) inputEl.value = shown;
}

export function attachNamePicker(inputEl, options = {}) {
  if (!inputEl || inputEl.dataset.npAttached === "1") return inputEl && inputEl._namePicker;
  const opts = {
    groups: options.groups || null,
    allowOther: options.allowOther !== false,
    directory: options.directory || { members: [], otherNames: [], otherNamesReadable: false },
    onChange: options.onChange || null,
    onOther: options.onOther || null,
    placeholder: options.placeholder || null
  };
  if (opts.placeholder) inputEl.setAttribute("placeholder", opts.placeholder);
  inputEl.removeAttribute("list");
  inputEl.setAttribute("autocomplete", "off");
  inputEl.dataset.npAttached = "1";

  const wrap = inputEl.parentElement;
  if (wrap && getComputedStyle(wrap).position === "static") wrap.style.position = "relative";
  const menu = document.createElement("div");
  menu.className = "np-menu hidden absolute left-0 right-0 top-full mt-1 z-40 bg-white border border-[#E9DECE] rounded-xl shadow-xl max-h-64 overflow-y-auto";
  menu.setAttribute("role", "listbox");
  (wrap || inputEl.parentElement).appendChild(menu);

  const state = { open: false, items: [], active: 0 };

  function hide() {
    state.open = false;
    menu.classList.add("hidden");
    menu.innerHTML = "";
  }

  function applyRef(ref) {
    setInputRef(inputEl, ref, opts.directory);
    if (typeof opts.onChange === "function") opts.onChange(ref, inputEl);
  }

  function chooseMember(m) {
    applyRef(refFromMember(m));
    hide();
  }

  async function chooseOther(name, note) {
    const typed = stripDisplayDecorations(String(name || inputEl.value || "")).replace(/\s+/g, " ").trim();
    if (!typed) return;
    let ref = refFromOther({ name: typed });
    if (typeof opts.onOther === "function") {
      try {
        const saved = await opts.onOther({ name: typed, note: note || "" });
        if (saved) ref = saved;
      } catch (_) {
        ref._otherWriteFailed = true;
      }
    }
    applyRef(ref);
    hide();
  }

  function boxQuery() {
    const cur = getInputRef(inputEl);
    const raw = (inputEl.value || "").trim();
    if (cur && fold(raw) === fold(displayValueForRef(cur, opts.directory))) return cur.name;
    return stripDisplayDecorations(raw) || raw;
  }

  function render() {
    const q = boxQuery();
    const members = q ? filterMembers(opts.directory.members, q, { groups: opts.groups }).slice(0, MAX_SUGGESTIONS) : [];
    const others = q && opts.allowOther ? filterOtherNames(opts.directory.otherNames, q).slice(0, 8) : [];
    const exact = exactMemberMatch(opts.directory.members, q, { groups: opts.groups });
    const items = [];
    members.forEach((m) => items.push({ kind: "member", m }));
    others.forEach((o) => items.push({ kind: "other", o }));
    if (q && opts.allowOther && !exact) items.push({ kind: "useOther", name: q });
    state.items = items;
    if (!items.length) {
      hide();
      return;
    }
    if (state.active >= items.length) state.active = 0;
    menu.innerHTML = items
      .map((it, i) => {
        const active = i === state.active ? " bg-[#FAF6EF]" : "";
        if (it.kind === "member") {
          const hh = it.m.householdId ? ` · ${it.m.householdId}` : "";
          return `<button type="button" data-np-i="${i}" class="w-full text-left px-3 py-2 hover:bg-[#FAF6EF] transition cursor-pointer${active}">
            <div class="text-xs font-bold text-[#152548] truncate">${escapeHtml(wardDisplayName(it.m))}</div>
            <div class="text-[10px] text-[#536484]">${escapeHtml((it.m.group || "") + hh)}</div>
          </button>`;
        }
        if (it.kind === "other") {
          return `<button type="button" data-np-i="${i}" class="w-full text-left px-3 py-2 hover:bg-[#FAF6EF] transition cursor-pointer${active}">
            <div class="text-xs font-bold text-[#152548] truncate">${escapeHtml(otherDisplayName(it.o.name))}</div>
            <div class="text-[10px] text-[#536484]">Other${it.o.note ? " · " + escapeHtml(it.o.note) : ""}</div>
          </button>`;
        }
        return `<button type="button" data-np-i="${i}" class="w-full text-left px-3 py-2 hover:bg-[#FAF6EF] transition cursor-pointer${active}">
          <div class="text-xs font-bold text-[#A74319]">${escapeHtml(otherPromptText(it.name))}</div>
        </button>`;
      })
      .join("");
    menu.classList.remove("hidden");
    state.open = true;
  }

  function activate(it) {
    if (!it) return;
    if (it.kind === "member") chooseMember(it.m);
    else if (it.kind === "other") chooseOther(it.o.name);
    else chooseOther(it.name);
  }

  inputEl.addEventListener("input", () => {
    const cur = getInputRef(inputEl);
    if (cur) {
      const labeled = displayValueForRef(cur, opts.directory);
      if (fold(inputEl.value) !== fold(cur.name) && fold(inputEl.value) !== fold(labeled)) setInputRef(inputEl, null);
    }
    render();
  });
  inputEl.addEventListener("focus", () => {
    if ((inputEl.value || "").trim()) render();
  });
  inputEl.addEventListener("keydown", (e) => {
    if (!state.open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      state.active = (state.active + 1) % state.items.length;
      render();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      state.active = (state.active - 1 + state.items.length) % state.items.length;
      render();
    } else if (e.key === "Enter") {
      if (state.items[state.active]) {
        e.preventDefault();
        activate(state.items[state.active]);
      }
    } else if (e.key === "Escape") hide();
  });
  menu.addEventListener("mousedown", (e) => {
    const btn = e.target.closest("[data-np-i]");
    if (!btn) return;
    e.preventDefault();
    activate(state.items[Number(btn.getAttribute("data-np-i"))]);
  });
  document.addEventListener("mousedown", (e) => {
    if (e.target === inputEl || menu.contains(e.target)) return;
    hide();
  });

  const api = {
    hide,
    render,
    refresh(dir) {
      if (dir) opts.directory = dir;
      const cur = getInputRef(inputEl);
      if (cur) setInputRef(inputEl, cur, opts.directory);
    },
    getRef: () => getInputRef(inputEl),
    setRef: (ref) => setInputRef(inputEl, ref, opts.directory)
  };
  inputEl._namePicker = api;
  return api;
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export const OTHER_NAME_FIELD_LIST = OTHER_NAME_FIELDS;
