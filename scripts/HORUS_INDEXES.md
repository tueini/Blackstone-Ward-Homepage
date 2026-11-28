# Horus RAG indexes (Home functions 1.4.0, 2026-11-27)

Horus (`functions/handbookAssistant.js`) answers only from two PRIVATE indexes bundled with the function.
Both live in `BW_Home/functions/` (the functions bundle). Never copy them under any `public/` folder.

## 1. General Handbook: `functions/handbook-index.json`
- Built by `scripts/build-handbook-index.js` from the public General Handbook
  (https://www.churchofjesuschrist.org/study/manual/general-handbook?lang=eng). Each entry: section number, title,
  chapter, canonical URL with the `#title_numberN` anchor, and a short excerpt (default 420 characters).
- Refresh (when the Church updates the Handbook, or monthly):
  `cd ~/Documents/0Church/Blackstone_Ward/zzWeb/BW_Home && node scripts/build-handbook-index.js`
  Options: `--chapters 7,10,11`, `--max-excerpt 420`, `--out <path>`.
- Answers cite `Source: <section> <title>`; the server writes the Handbook link (the model never writes links).

## 2. Site help: `functions/site-help-index.json`
- How-tos for blackstoneward.org and every hub, written BY HAND from each hub's HTML/JS only. No member data:
  no names, phones, emails, ids or Firestore content.
- One block per hub in `hubs[]`: `hub` (key), `code` (id prefix), `name`, `baseUrl` (must be
  `https://…blackstoneward.org`, otherwise the whole block is ignored), `version` (hub version the text matches), `entries[]`.
- Entry: `id` = `<CODE>-<n>` (never reuse a number), `title`, `path` (page path on that hub), `text` (<= 600 chars).
  Bish entries also carry `tab` and optional `anchor`, so the Bish UI opens the tab instead of a link.
- Current hubs: `bish` (BISH-), `home` (HOME-), `youth` (YOUTH-), `auction` (AUCT-).
- Add a hub: append a block, e.g.
  `{ "hub": "music", "code": "MUSIC", "name": "...", "baseUrl": "https://music.blackstoneward.org", "version": "x.y.z", "entries": [ ... ] }`
  The server and UI need no change (UI links open only `https://*.blackstoneward.org`).
- Refresh: whenever a hub release changes tabs, buttons, page names or paths, edit that hub's entries and its
  `version`, and update `builtAt`.

## After either refresh
1. `cd ../BW_Platform && node --test tests/30-handbook-assistant.test.js` (checks structure, unique ids, no emails or
   phones, routing for each hub).
2. Bump the Home functions version, update BW_Home CHANGELOG.md / PROJECT_STATE.md and HUBS_NOTES.md.
3. Deploy ONLY the function, as its own approval (live change):
   `cd BW_Home && firebase deploy --only functions:handbookAssistant --project blackstoneward-b861c`
