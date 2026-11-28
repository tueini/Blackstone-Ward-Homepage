# Blackstone Ward homepage changelog


## Functions 1.4.2 — November 28, 2026 (LIVE 12:14:31 PM ET, Duane 12:12 PM ET "approve function" [pt648u]; Code Complete 12:25 AM ET; Duane t644u 12:18 AM ET "approved" [pt644u] after the 12:11 AM ET follow-up miss; branch `chuck/2026-11-27-handbook-assistant` @ 81e4fa9). Previous live function was 1.4.1 (8654bc0, 12:03:46 AM ET, revision `handbookassistant-00002-lug`). Bish stays 1.3.17 (no client change).
- **Why:** Duane asked "Who can baptize an 8 year old child of record?" then "I understand that the bishop holds keys. Assuming he approves, who is eligible to baptize the child?" and Horus said the Handbook doesn't cover it. 18.7.3 holds the answer but was dropped by the coverage filter (filler words like understand/assuming/he/approve counted as required words; baptize vs baptizing vs baptism did not match; "approve" vs "approved" did not match). The strict refusal then fired as designed.
- **1) Word families + stop words:** baptize/baptizes/baptizing/baptized/baptism, child/children, approve/approved/approves/approval, confirm*, ordain*, release*, sustain*, marry/married/marriage, eligible/eligibility, perform*, hold/holds/held/holder, key/keys and about 15 more reduce to one stem on BOTH the question and the index. `he him his himself she her hers herself` are stop words. Conversational fillers (understand, assuming, suppose, wondering, actually, really, maybe, ...) are dropped from the QUESTION only (still indexed). An age phrase such as "8 year old" is dropped from the question. "Who can baptize/confirm/ordain ..." adds a boosted "perform" group so "Who Performs the Ordinance" sections (18.7.3, 18.8.1) rank.
- **2) Coverage:** now IDF-weighted (rare topic words count more than common ones; a word found nowhere in the index counts a fixed, modest 2.0 so off-topic nouns like "pizza" still count against coverage), and a question with 6+ words needs 35% instead of 50%. A section too large for the remaining context budget is skipped instead of ending the list.
- **3) Follow-ups:** a request with history that looks like a follow-up (shares a topic word with the earlier question, or has he/she/that/what if/..., or has 2 or fewer topic words) is also searched together with the earlier question; the sections the earlier answer was built on are pinned (the earlier question is re-run on the server, plus any section numbers named in the earlier answer text); and best-scoring sibling sections under the same parent are added (max 6 sections, 4200 characters). Challenges ("you were wrong") get the same expansion. No client change and nothing is stored: history already arrives with each request.
- **4) Softer reply:** prompt rules 9 (answer the part the excerpts cover and say what they do not) and 10 (follow-ups use the earlier topic); the exact refusal is now only for "nothing relevant". If the model still declines but the Handbook search was strong (top score >= 10 for a fresh question, >= 7 for a follow-up), the user gets `MSG.partial` ("I couldn't find a clear answer ... The closest ones are linked below") with the closest Handbook sections as server-owned links (`covered:true, partial:true`; the Bish client already shows sources). Weak matches and off-topic questions keep the hard refusal; no-match still makes no model call. Log line gains booleans/outcome only: `followUp`, `outcome:"partial"`.
- **Measured (local):** gold section in model context on a 22-question regression set (incl. Duane's two): **1.4.1 19/22 (86%) -> 1.4.2 21/22 (95%)**; both of Duane's questions now include 18.7.3 (alone, and as a follow-up). Remaining miss: "Who can confirm a child of record after baptism?" (18.8.1 ranks 30th; it was already a miss). Title-as-query top-1 **630/784 -> 631/784** (no regression); in top 4 742 -> 738. Real local Ollama call (gemma4:12b-mlx on MBProDH, same options): Q1 and Q2 each answer "performed by a priest or Melchizedek Priesthood holder approved by the bishop", cite 18.7.3 only, and Q2 adds that the bishop may allow a father who is not fully temple worthy to baptize his child.
- Tests: `BW_Platform/tests/30-handbook-assistant.test.js` now 50 tests (was 43): the 22-question regression set, Duane's two questions, title-as-query floor, word families and fillers, `isFollowUp`, prompt rules, follow-up request end to end (and the soft reply), plus the existing not-covered test split into weak (hard refusal) and strong (soft reply).
- Files: `functions/handbookAssistant.js`, `functions/package.json` 1.4.1 -> 1.4.2. `handbook-index.json`, `site-help-index.json`, `functions/index.js` unchanged. Backups: `.bw_home_fn142_20261127/` (SHA256SUMS).
- LIVE 12:14:31 PM ET: deployed `--only functions:handbookAssistant --project blackstoneward-b861c` (no other functions, no hosting, no rules). Revision `handbookassistant-00003-niy` takes 100% traffic, Node 22, 256 MiB, 60 s timeout. Unauthenticated POST with a question returns 401 signin-required. Startup TCP probe succeeded; no startup errors. Rollback: `git checkout 8654bc0 -- functions/handbookAssistant.js functions/package.json` and the same `--only` deploy, or shift Cloud Run traffic to `handbookassistant-00002-lug`.

## Functions 1.4.1 — November 28, 2026 (LIVE 12:03:46 AM ET, Duane 12:02 AM ET "approve functions and stage it" [pt637u]; Code Complete ~11:59 PM ET Nov 27; Duane t631u 11:44 PM ET, t632u 11:47 PM ET; branch `chuck/2026-11-27-handbook-assistant` @ 8654bc0; pairs with Bish 1.3.17 staged 12:04:45 AM ET). Previous live function was 1.4.0 (520e338, 10:48:25 PM ET Nov 27, revision `handbookassistant-00001-vay`).
- **Index fix (found by Duane: Horus said the Handbook "doesn't cover" civil marriage):** `scripts/build-handbook-index.js` cut every section at the first sentence after 50% of 420 characters, so 38.3 lost three of its four circumstances (including "A couple is not planning to be married in a temple."). New `assemble()` keeps whole paragraphs and list items (never mid-item), finishes an open list, and keeps any section that fits 2240 characters whole; soft cap 1400, hard cap 2240 (`maxExcerpt` 1400, `maxExcerptHard` 2240 in the JSON). Rebuilt from the public Handbook 2026-11-27 11:49 PM ET: 784 sections (same set), **809,171 bytes** (was 454,237; avg excerpt 781 chars, was 329; 44 sections still end with an ellipsis). **38.3 is complete (1084 chars, all four circumstances) and 38.3.1 is complete (2130 chars, through "may not accept fees").**
- Ranking: Handbook scoring weighs the first 420 characters at full weight and the rest at 0.2 (site help unchanged), so long sections do not out-rank short on-topic ones; title-as-query top-1 630/784 vs 641/784 for 1.4.0 (full-text weighting would have been 611).
- **Corrections are handled, not refused again:** a challenge ("you were wrong", "it does cover this", "look again", "add this to your index", a quoted section number) is detected by text only (`isChallenge`, `retrievalQuery`). Retrieval then searches the EARLIER question plus the new text (challenge words removed) instead of the challenge alone. Prompt rules 6-8: a correction is not a rules-change attempt; re-read the excerpts, say "You're right / I missed that" if they support the user, otherwise say what they do say and name the section; an earlier "doesn't cover this" may have been given with incomplete excerpts. If the model still refuses a challenged question, the user gets a different honest message (`challengeNotCovered`), never the same canned refusal. The log line gains one boolean, `challenge`.
- **Limits (t632u), old -> new:** question 600 -> 1200 characters; history item 1500 -> 3000 and total 3500 -> 6000; `num_predict` 300 -> 500 tokens; answer cap 1400 -> 2000 characters; "at most 120 words" -> 180; `num_ctx` 4096 -> 6144; context 2400 -> 4200 characters; upstream timeout 45 s -> 50 s (function timeout stays 60 s). Synonyms added: reason/reasons/circumstances, married/marry/marrying.
- Site help (`site-help-index.json`): BISH-9 "Google Sheet sync and CSV exports" removed (number retired, never reused; the feature is gone in Bish 1.3.17); BISH-20 "Using Horus" now describes the top-right button, the floating head and the Sound button; Bish block version 1.3.17.
- No new logging or storage: prompts, answers and history are still never logged or stored.
- Files: `functions/handbookAssistant.js`, `functions/handbook-index.json`, `functions/site-help-index.json`, `functions/package.json` 1.4.0 -> 1.4.1, `scripts/build-handbook-index.js`, `scripts/HORUS_INDEXES.md` (BW_Home/package.json is `"type":"module"`, so the builder runs from a `.cjs` copy; documented). `functions/index.js` is unchanged.
- Deployed 12:03:46 AM ET 2026-11-28 with `firebase deploy --only functions:handbookAssistant --project blackstoneward-b861c` only. Revision `handbookassistant-00002-lug`, hash `690d95b1e0027bb21e46e12fbc31b9c1f7608c87`. Unauthenticated POST returns 401. No other functions changed. Config doc was not touched. Rollback: redeploy 1.4.0 from 520e338 with the same `--only` command, or shift Cloud Run traffic to `handbookassistant-00001-vay`.

## Functions 1.4.0 — November 27, 2026 (Code Complete ~10:45 PM ET, NOT deployed; Duane go-ahead 10:20 PM ET, clarifications 10:30 / 10:34 PM ET; branch `chuck/2026-11-27-handbook-assistant`; local commit only). Site stays 1.2.97.
- New HTTPS function **`handbookAssistant`** (Horus): relays a signed-in leader's question to Ollama `gemma4:12b-mlx` on the ward Mac mini via Cloudflare Access (service token from Secret Manager `CF_ACCESS_CLIENT_ID` / `CF_ACCESS_CLIENT_SECRET`) and Tunnel `bw-ai` (`https://ai.blackstoneward.org`). Non-streaming, `think:false`, token cap.
- Who may use it: `handbook_assistant_config/main` (missing = disabled), default the five General Bishopric seats RC2-RC6, or a leaderIds allow-list. Same session model as the rules; `pw_` and Google sessions never count.
- Rate limits: hashed counters in `handbook_assistant_limits` (count + expireAt only), fail closed. Nothing about the conversation is logged or stored; one metadata-only log line per request.
- Two private RAG indexes in the functions bundle: `functions/handbook-index.json` (General Handbook, built by `scripts/build-handbook-index.js`) and `functions/site-help-index.json` (blackstoneward.org + Bish, Home, Youth, Auction, per hub with URL metadata, written by hand from code/UI, no member data). Refresh guide: `scripts/HORUS_INDEXES.md`.
- Answers must cite a Handbook section (server writes the link) or a site-help code (server writes the hub page URL / Bish tab), or say the Handbook / website help doesn't cover it. "Assistant unavailable" for Access 403, tunnel/mini down, 5xx and timeouts.
- Files: `functions/index.js` (export block appended only), `functions/handbookAssistant.js`, `functions/handbook-index.json`, `functions/site-help-index.json`, `functions/package.json` 1.3.1 -> 1.4.0, `scripts/build-handbook-index.js`, `scripts/HORUS_INDEXES.md`. CORS uses the existing `setCorsHeaders` / `isAllowedOrigin` (bish + test origins).
- Deploy ONLY with `firebase deploy --only functions:handbookAssistant --project blackstoneward-b861c` (separate approval; never a broader functions deploy).

## 1.2.97 — November 26, 2026 (PRODUCTION 9:56:00 PM ET, Duane 9:54 PM ET "push to live"; staged 8:58:50 PM ET; Code Complete ~9:00 PM ET; branch `chuck/2026-11-26-ward-events-denied-alert`; Duane 8:55 PM ET "Build Home 1.2.96 with a scripted edit, stage it, then we do the rules"; numbered 1.2.97 because 1.2.96 was already used by the unmerged signup Phase 1 build staged 2026-11-25 8:30 PM ET)
- **Calendar saves now alert when the website refuses them** (`public/admin/admin-app.js`): the three `Ward_events` writes (Youth transfer, save event, delete event) call the existing `alertContentWriteDenied(err)` on a permission-denied error, so a password or Google sign-in no longer looks "saved" when it only saved on the device. Passkey and text-message sign-ins are unchanged. Messages and the 3-second throttle are the existing ones; no rules change in this build.
- Version sync 1.2.95 -> 1.2.97: `package.json`, `package-lock.json`, `public/data/ward.json`, footers and `?v=` URLs in `public/index.html`, `admin/index.html`, `music/index.html`, `td/index.html`, `spotlights/index.html`, `404.html`, `js/home.js`, `js/music-coordinator.js`, import URLs in `admin/admin-app.js`. Scripted edit approved by Duane for this patch only; backup `.bw_home_1.2.97_20261126/` with `SHA256SUMS.before` / `SHA256SUMS.after`.
- Companion to BW_Platform rules draft `prod-rules/firestore.rules.draft-20261126-lock-calendars` (rules went LIVE 10:00:08 PM ET, after this Home production deploy).


## Functions 1.3.1 — LIVE 2026-11-25 10:13:17 PM ET (Duane 10:09 PM ET "approve email fix")
- `functions/changeRequestNotify.js` (`buildMailsForEvent` create branch): the Clerk email subject is `after.mailSubject` only when `after.handoff === 'callings'` and the subject is exactly `Calling change (sustained)` or `Calling change (released)`; otherwise it stays `Directory change request (open)`. Closed-request subjects are unchanged. Deployed `--only functions:changeRequestNotify --project blackstoneward-b861c` from BW_Home (nothing else created, updated or deleted). The function is ACTIVE, us-central1, nodejs22, Gen2. `functions/package.json` 1.3.1. Home site remains 1.2.95 (no site-code change, no hosting deploy). Tests: BW_Platform `tests/24-change-request-notify.test.js` 5/5 (new unit cases for the two exact subjects, rejected near-misses, and the unchanged close path). Backup `.bw_home_functions_1.3.1_20261125-221119/` (SHA256SUMS). Cherry-picked onto `chuck/2026-11-25-callings-email-fix` from `8584a32` / `785383a` (signup work not included).

## Functions 1.3.0 — LIVE 2026-11-24 3:15:26 PM ET (Duane t478u 3:11 PM ET "Approved to go live.")
- `functions/changeRequestNotify.js` (and export from `functions/index.js`): emails the Ward Clerk when a change request is opened, and the requester when it is closed, by writing a `mail` doc for the existing Trigger Email extension. Deployed `--only functions:changeRequestNotify --project blackstoneward-b861c` (nothing else). ACTIVE, us-central1, nodejs22, Firestore written trigger on `change_requests/{requestId}`. Home site remains 1.2.95.

## 1.2.95 — November 23, 2026 (Code Complete ~10:42 PM ET; test (hosting:staging) 10:39 PM ET, test now serves Bish 1.1.78; PRODUCTION 2026-11-23 11:25 PM ET (Duane approved 11:24 PM ET). Duane chat 10:23 / 10:24 / 10:27 PM ET)
- **Music Planner** (`public/js/music-coordinator.js`, same code as Bish 1.1.78 apart from the known prefill-helper spot and version comments): four meeting types.
- **Four meeting types** (Duane 10:23 PM ET): Standard, Fast & Testimony, Special, No Ward Sacrament. Older stored types are mapped when read, nothing is bulk-rewritten: Stake Conference / General Conference / Special Stake Meeting -> No Ward Sacrament (reason = old name); Ward Conference / Primary Program / Christmas Program / Easter Program (or any other name) -> Special (description = old name); Fast Sunday stays the stored value for Fast & Testimony. A Sunday's record only changes when someone saves it, and the old name moves into the new reason/description field. Shared helper block `// BEGIN meeting-kind helpers` is identical in Bish `bishopric-hub.js` and both `music-coordinator.js` copies (BW_Platform test 21).
- **New fields** in `home_content/bishopric_sacrament_v1` Sundays (no rules change; nothing deleted): `noWardReason`, `specialDescription`, `programRunBy`, `programRunByOrg`, `specialMusicSlots` [{type hymn|musical_number, hymn, musicalNumber}], `closingType` (hymn|musical_number|none), `closingMusicalNumber`. The first Special slot is mirrored into `intermediateType/intermediateHymn/musicalNumber` for older app versions.
- **Special** (Duane 10:23-10:27 PM ET): description box ("e.g. Primary Program") shown as "Special: <description>"; musical slots between Sacrament Hymn and Closing Hymn (+ Add Musical Slot, Hymn with hymns pull-down or Musical Number text, Remove); closing music Closing Hymn / Musical Number / None; optional "Program Run by: <org>" ("e.g. Primary") hides speakers and the middle slots and shows "Speakers and Musical numbers to be provided by <org>" (saved speakers/slots kept, only hidden).
- **No Ward Sacrament:** reason box ("e.g. Stake Conference", suggestions Stake Conference / General Conference / Special Stake Meeting / Snow Storm); Sunday cards and the Music Planner show "No Ward Sacrament: <reason>". Special Stake Meeting now counts as No Ward Sacrament (it was a regular meeting type before; only 2026-06-14 used it).
- **Fast & Testimony:** no intermediate music (as before in the Music Planner).
- Music Planner: tab footers and badges show "Fast & Testimony", "Special: <description>", "No Ward Sacrament: <reason>"; Special Sundays get the slots editor and the closing music choice; Program Run by shows its text instead of the slots. Meeting type itself is set in the Bishopric Hub.
- Versions 1.2.95. Backup `.bw_home_1.2.95_20261123/` (SHA256SUMS.txt).

## 1.2.94 — November 23, 2026 (LIVE 10:07 PM ET, test 10:06 PM ET; Duane chat t450u "Please edit the example text and push to live")

- Leader edit form example text no longer shows the owner's real email/phone: `public/admin/index.html` L1173 `#leader-email` placeholder "e.g. mahonri.moriancumer@example.com" (was the owner's email); L1180 `#leader-phone` placeholder "(508) 555-0123 or +15085550123" (was the owner's number). Same wording structure; Mahonri pattern. No code changes.
- Versions 1.2.94. Backup `.bw_home_1.2.94_20261123/` (SHA256SUMS.txt).

## functions 1.2.6 (passkeyApi 1.4.1) — November 23, 2026 (LIVE 9:51 PM ET; Duane approved in chat t449u, cleanup item 3). Hosting unchanged.

- `functions/index.js` L674-677 (`handlePasswordLogin`): when a leader has no scrypt credential, the one-time SHA-256 check now also reads a `ward_leader_credentials/{leaderId}` record `{ algo: 'sha256-legacy', legacyHash }` (old hashes moved off the browser-readable `ward_leaders` by `BW_Platform/migration/move-legacy-pwhash.js`). On success it is replaced with salted scrypt as before (`pwStoreScrypt` overwrites the credentials doc). A scrypt record still always wins. No other change.
- `functions/package.json` + lockfile root 1.2.6. Tests: `BW_Platform/tests/19-password-login.test.js` 16/16 (emulator, FAKE data). Backup `.bw_home_functions_1.2.6_20261123/`.

## 1.2.93 — November 23, 2026 (Code Complete ~9:45 PM ET; Duane approved test + production in chat t449u)

- **Hard-coded owner fallbacks removed from Home /admin (cleanup item 2).** The owner's real `ward_leaders/leader_duane_harris` record (active, RC2+RC1) was checked read-only first.
  - `public/admin/admin-app.js` L962: text-sign-in name pre-check no longer adds a hard-coded owner entry (name + phone) to the pool.
  - L1558, L1559, L1576: sidebar badge name/email/initials fallbacks are now 'Leader' / empty / 'Leader' instead of the owner's name and email.
  - L2156: the leaders listener no longer auto-creates/re-seeds the owner record from the browser (`setDoc` removed).
  - L5156-5158: password reset no longer re-seeds the owner record from the browser (`setDoc` removed); the server matches the verified phone.
  - L5218: the pre-sign-in leader list no longer adds a hard-coded owner entry.
  - `public/admin/index.html` L318, L324, L1285, L1293, L1297: static owner name/email/phone placeholders inside the badge and onboarding spans are now empty (JS fills them).
  - **Kept on purpose (owner lockout safety):** `resolveLeaderRole` owner check (L374-375), owner delete protection (L488), `HOME_ADMIN_OWNER` seat backup (L721, asserted by BW_Platform test 13), the verified-phone owner profile after text sign-in (L1089-1098, asserted by test 06) and the owner phone exception in password reset (L5050). Input placeholders with the owner's email/phone (`index.html` L1173, L1180) left for Duane (hint-text rule).
- Versions 1.2.93. Backup `.bw_home_1.2.93_20261123/` (SHA256SUMS.txt).

## 1.2.92 — November 23, 2026 (Code Complete ~9:40 PM ET; Duane approved test + production in chat t449u "Clean all of these one at a time ... push to live")

- **Dead Password Sign-In tabs hidden (cleanup item 1):** with the master password retired (1.2.91) these tabs could sign no one in (no personal-password path; they always said "Incorrect password").
  - Home Bishopric Hub dialog: `public/index.html` L218-219 `#bishopric-tab-password` gets `hidden style="display:none"`; `public/js/home.js` L461 tab list skips hidden tabs (arrow keys stay on Phone Text (SMS)); passkey hints L544 and L565 now point to Phone Text (SMS) instead of name and password.
  - Music Planner (identical edits in BW_Bish 1.1.76): `public/music/index.html` L334-336 `#btn-music-tab-password` hidden; `public/js/music-coordinator.js` L2341 tab list skips hidden tabs; hints L702, L735 and L850 no longer mention Password.
  - Not changed: Home /admin password sign-in (works through passkeyApi /password/login). The hidden forms and handlers stay in the page, unused.
- Versions 1.2.92 (`package.json`, lockfile root, `ward.json`, footers, `?v=`, `MUSIC_PLANNER_VERSION`). Backup `.bw_home_1.2.92_20261123/` (SHA256SUMS.txt).

- 2026-11-23 ~12:40 AM ET: `functions:passkeyApi` 1.3.0 (`/password/login`) deployed to production (Duane approved). No hosting, rules, or version change.

## 1.2.91 — November 23, 2026 (LOCAL ONLY, Code Complete ~3:05 PM ET; not deployed; production 1.2.90, test serves Bish 1.1.74) + functions 1.2.5 (passkeyApi 1.4.0, NOT deployed)

- **#3 master password retired (Duane, chat t430u "retire it", 2:47 PM ET):** the temporary master hash is gone from `public/security-config.js` (L2-3 comment, L5 `MASTER: "RETIRED-2026-11-23"`, L17 first `MASTER_APPROVED_HASHES` entry), `public/admin/admin-app.js` (`AUTHORIZED_MASTER_HASHES` removed, L620), `public/js/home.js` (`MASTER_APPROVED_HASHES` removed, L370; Bishopric dialog check removed, L523) and `public/spotlights/index.html` (L187, L195). Home /admin no longer opens a break-glass session: the master check in `handleLogin` is removed (L1796) and `checkAuth` signs out any tab with no leader profile, a 'Master Admin' profile or the old break-glass flag (L1523). Leftover break-glass helpers (`isBreakGlassProfile`, the L1545 fallback) are now unreachable and left in place. `zzWeb/tools/set-temp-master.sh` is obsolete (its placeholder pre-flight now fails, so it changes nothing). Comment-only: `public/admin/index.html` L222.
- **#2 personal passwords on the server (Duane, "move to the server"):** `public/js/passkey-client.js` L97-106 adds `loginWithLeaderPassword` and `setLeaderPassword`. `public/admin/admin-app.js`: password sign-in sends name + password to `/password/login` and uses the returned profile, or with passkeyApi 1.3.0 the cached record by name (L1796-1840; a name is required; 429/5xx show the server message, everything else the generic message); setting a password (leader form L4444/L4466, Set Password modal L4540, text-message self reset L5173) goes only to `/password/set` via `saveLeaderPasswordOnServer` (L4469) with this tab's Firebase ID token; no hash is made or copied into `ward_leaders`; "Password set" shows from `hasPassword` or the old field (L4256, L4357). `public/js/home.js` and `public/js/music-coordinator.js` (L153, L676; personal passwords stay disabled there) no longer compute or compare any hash.
- **functions 1.2.5 / passkeyApi 1.4.0 (`functions/index.js`):** scrypt helpers and `ward_leader_credentials` (L546-604; N 16384, r 8, p 1, 64-byte key, 16-byte random salt; the collection has no rule, so browsers cannot read or write it). `/password/login` (L662-724) checks the scrypt record first, else the old SHA-256 field once and then re-hashes to scrypt and deletes `ward_leaders.passwordHash` (sets `hasPassword: true`); once a scrypt record exists the old field is ignored and deleted on the next success; success now also returns the leader's own non-secret profile. New `POST /password/set` (L726-801, route L827): Bearer ID token required; allowed = admin/bishopric passkey sign-in, BW_Platform admin claim, or the leader's own passkey/text/Google sign-in (`enrollAllowed`); a text sign-in with no leaderId sets the one active leader whose phone matches; `pw_` sessions are refused; 6-200 characters. `functions/package.json` + lock 1.2.5.
- **#9 Music Planner SMS name box (Duane, 2:52 PM ET):** `public/music/index.html` L394 now matches Bish byte for byte (autocomplete/autocorrect/autocapitalize off, spellcheck false, 1Password/LastPass ignore, `data-form-type="other"`, placeholder kept). Bish's input still carries `required`, so it is kept here too; the form is `novalidate`, so the browser never blocks an empty submit and the shared JS shows its own error (the SMS submit handler is identical in both copies).
- Tests: `node --check` on every changed JS file, functions and the spotlights inline module; `npm run check` passed; mocked server test (in-memory Firestore, fake data, `/tmp/pwtest/test.js` on the Mac) 28/28 (legacy once then scrypt, old field ignored and deleted, lower-case rule unchanged, set permissions, phone reset, TTL field on rate-limit docs).
- Versions 1.2.91 (package.json/lock, ward.json, footers, `?v=`). Backup `.bw_home_1.2.91_20261123/` (SHA256SUMS.txt). Firestore rules draft (NOT deployed): `BW_Platform/prod-rules/firestore.rules.draft-20261123-pwhash`.

## 1.2.90 — November 23, 2026 (LOCAL ONLY, Code Complete ~1:01 PM ET; not deployed; production 1.2.89, test serves Bish 1.1.72)

- **Music Planner autosave-only (Duane, chat t425u):** autosave (the form change/input listeners with debounced `persistMusicToFirestore`) already saves the whole month, so the manual save buttons are gone.
  - `public/music/index.html`: removed the bottom "Save Month Music & Sync to Bishopric Hub →" submit button (`#btn-music-save-all-bottom`, was after the status span at L571). The `#music-bottom-save-status` sync note and its card are kept and visible. The line under the SUNDAYS heading (L554) now reads "Changes save automatically and sync to the Bishopric Hub."
  - `public/js/music-coordinator.js`: removed the per-Sunday "Save <date> Music ✓" button from the card render (after the `music-card-status-*` span at L1521, which is kept). The click branch for `[data-save-sunday-music]` (L2130–2145) is left in place and is inert. The form submit handler (L2229) is kept and still calls preventDefault. `#btn-music-save-all-top` is not in the HTML; its optional-chained listener (L2268) is inert and unchanged.
  - Headless test on a box copy (dummy data, Firestore blocked): typing in a chorister box fired one debounced save; the status went "Saving & syncing..." → "Saved locally (offline)", the bottom note updated, and the value was written to the local cache. Enter did not navigate. No console errors.
  - Same change in BW_Bish 1.1.74.
- Versions 1.2.90 (package.json, package-lock.json, ward.json, `?v=` tags, footers, constants). `npm run check` passed. Backup `.bw_home_1.2.90_20261123/` (SHA256SUMS.txt). Not committed.

## 1.2.89 — November 23, 2026 (LOCAL ONLY, Code Complete ~12:53 PM ET; not deployed; test serves Bish 1.1.72, Home production 1.2.82)

- **Music Planner Sunday tabs (Duane, chat t422u):** the tab footer now shows the meeting type ("Fast Sunday", "Stake Conference", or "Standard Sunday" when the type is Standard or empty), replacing the opening-hymn summary and "View Tab →". Fast/Stake and other special types are red-orange, Standard is muted, and past tabs stay grey. The active tab keeps "● Active Tab" on the right. The small meeting-type tag at the top right of each tab is removed. `public/js/music-coordinator.js`: L1411–1412 (label), tag line removed after the ordinal at L1427, L1432–1433 (footer). No HTML or CSS change apart from versions.
  - Same change in BW_Bish 1.1.73.
- Versions 1.2.89 (package.json, package-lock.json, ward.json, `?v=` tags, footers, constants). `npm run check` passed. Backup `.bw_home_1.2.89_20261123/` (SHA256SUMS.txt). Not committed.

## 1.2.88 — November 23, 2026 (LOCAL ONLY, Code Complete ~12:43 PM ET; not deployed; test serves Bish 1.1.71, Home production 1.2.82)

- **Music Planner Sunday folder tabs (Duane, chat t420u), modeled on the Bishopric Hub Sacrament planner's Sunday strip:** the vertical stack of Sunday cards is now a tab row (`#music-sunday-tabs`, role=tablist), with one tab per Sunday in the selected month (4 or 5) and a connected panel (`#music-sundays-container`, role=tabpanel, navy border).
  - Each tab shows the ordinal ("1st Sunday"), the short date, a meeting-type tag when the Sunday isn't Standard, and a footer with the opening hymn ("Opening #NN", "Not set" or "No ward sacrament") plus "View Tab →" or "● Active Tab". Past Sundays are grey; the active tab is white with a teal top border and joins the panel. Tabs are equal width (`flex-1 min-w-[9.5rem]`), and the row scrolls sideways on narrow screens, keeping the active tab in view.
  - `public/music/index.html`: tab row + panel markup L558–L568; style rule L221–L226 drops the card's own border/shadow inside the panel.
  - `public/js/music-coordinator.js`: `selectedMusicSundayDate` (L95); tab rendering in `renderMusicPlanner()` (L1399–L1452) defaults to the next upcoming Sunday in the month, else the first; switching month or year resets it, and re-renders keep it. Every Sunday card is still rendered, and the inactive ones are hidden (L1739–L1744). The tab click handler (L2130–L2138) collects the form, then re-renders.
  - Save-all is unchanged: `collectMonthMusicFormIntoState()` (L1838) reads every `[data-sunday-music-card]` in the container, hidden ones included. Input ids, data attributes, per-Sunday Save buttons, autosave and dropdowns are unchanged. No placeholder text changed.
  - Tested headless on a box copy with dummy data and Firestore blocked: 5 tabs for Nov 2026, 4 for Dec 2026; tab clicks switch the panel; per-Sunday Save and Save Month Music ran with no JS errors; a value set in a hidden Sunday card survived Save Month Music.
  - Same change in BW_Bish 1.1.72.
- Versions 1.2.88 (package.json, package-lock.json, ward.json, `?v=` tags, footers, constants). `npm run check` passed. Backup `.bw_home_1.2.88_20261123/` (SHA256SUMS.txt). Not committed.

## 1.2.87 — November 23, 2026 (LOCAL ONLY, Code Complete ~12:20 PM ET; not deployed; test is 1.2.84, production 1.2.82)

- **Music Planner cleanup (Duane, chat t416u/t417u), `public/music/index.html`:**
  - Removed the "Sacrament Start Time: 12:00 PM" badge (`#music-start-time-badge`) from the monthly theme banner (was right after L525). The JS that sets it (`public/js/music-coordinator.js` L1373–1376) is guarded with `if (startTimeBadgeEl)`, so it is unchanged; `getSacramentStartTimeForYear` and the start-time data are kept.
  - Form subtext (L547) now ends "to sync all Sundays to Bishopric Hub." (plain text, no `<code>bish.blackstoneward.org</code>`). The JS does not rewrite it.
  - `#music-sync-status` (L500): dropped `bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl`, so it reads as a status notice; `text-xs font-bold text-emerald-700` kept. The JS only changes its text (L1252, L1300, L1305), never its classes, so no state brings back a background or border.
  - Footer (L570): `flex flex-col sm:flex-row items-center justify-between gap-2` → `flex flex-col items-center justify-center text-center gap-1`, so the text and version line are centered horizontally on the page, with the version stacked under the text, at all widths (measured centers 640/640 at 1280 and 320/320 at 640). Content unchanged.
  - Same change in BW_Bish 1.1.71.
- Versions 1.2.87 (package.json, package-lock.json, ward.json, `?v=` tags, footers, constants). `npm run check` passed. Backup `.bw_home_1.2.87_20261123/` (SHA256SUMS.txt). Not committed.

## 1.2.86 — November 23, 2026 (LOCAL ONLY, Code Complete ~12:01 PM ET; not deployed; test is 1.2.84, production 1.2.82)

- **Music Planner year selector (Duane, chat t414u):** `#music-year-btn-group` (id, role, aria and classes kept, plus `shrink-0`) moved out of the header row (beside `#music-sync-status`, which stays put) to the right of the month pills. The new wrapper `flex flex-wrap items-center gap-3` holds `#music-month-pills` (now `flex-1 min-w-0`, `overflow-x-auto` kept) and the year group (`public/music/index.html` L507–L518). The JS still fills the group by id (`public/js/music-coordinator.js` L1331); no JS change. Measured on a box copy: all 12 month pills and the 2025/2026/2027 years sit on one row at 1280 and 1024, with no pill scrolling. On narrow screens the years wrap below. Same change in BW_Bish 1.1.70.
- Versions 1.2.86 (package.json, package-lock.json, ward.json, `?v=` tags, footers, constants). `npm run check` passed. Backup `.bw_home_1.2.86_20261123/` (SHA256SUMS.txt). Not committed.

## 1.2.85 — November 23, 2026 (LOCAL ONLY, Code Complete ~11:56 AM ET; not deployed; test is 1.2.84, production 1.2.82)

- **Music Planner hero (Duane, chat t413u):** h1 "Sacrament Meeting Music Planner" → "Sacrament Mtg Music Planner" (`public/music/index.html` L458). Subtext → "Assign hymns, special musical numbers, choristers and accompanists for each Sunday of the month based on the monthly theme." (sync sentence removed) (L461). Subtext width `max-w-2xl` (672px) → `max-w-[29rem]` (464px), the smallest even rem at or above the measured h1 text width of 458.9px at 36px (sm:text-4xl), on L460. Measured on a box copy: Hymns / Choristers / Accompanists stay on one line at 1280 and 1024 (at 1024 they wrapped before). The gate-screen title and footer text are unchanged. Same change in BW_Bish 1.1.69.
- Versions 1.2.85 (package.json, package-lock.json, ward.json, `?v=` tags, footers, constants). `npm run check` passed. Backup `.bw_home_1.2.85_20261123/` (SHA256SUMS.txt). Not committed.

## 1.2.84 — November 23, 2026 (LOCAL ONLY, Code Complete ~11:41 AM ET; not deployed; test is 1.2.83, production 1.2.82)

- **Music Planner month section (Duane, chat):** title "Select Month & Review Monthly Theme" → "<YEAR> Monthly Music Selections" (`public/music/index.html` L494–495, new id `music-month-section-title`, static fallback "2026 Monthly Music Selections"); set from `selectedYear` in `renderMusicPlanner()` (`public/js/music-coordinator.js` L1325–1328). Month pills now show only the short month ("Jan", "Feb", …) (`public/js/music-coordinator.js` L1362); aria and styling unchanged. Same change in BW_Bish 1.1.68.
- Hymns button (Duane, chat): `#btn-music-open-hymns` label "📖 Hymns Table" → "Hymns" (no icon) (`public/music/index.html` L469). Other buttons unchanged.
- Page width: reviewed, no change (Duane confirmed the browser was zoomed in; no CSS changes).
- Versions 1.2.84 (package.json, package-lock.json, ward.json, `?v=` tags, footers, constants). `npm run check` passed. Backup `.bw_home_1.2.84_20261123/` (SHA256SUMS.txt). Not committed.

## 1.2.83 — November 23, 2026 (LOCAL ONLY, Code Complete ~11:35 AM ET; not staged or deployed; test and production are 1.2.82)

- **Security, Music Planner at blackstoneward.org/music (ported from BW_Bish 1.1.64 and 1.1.66, Duane approved in chat):** the shared `ward_auth_session` cookie no longer unlocks the planner; Continue only prefills the name and focuses the sign-in form (label "Verify to continue", `public/music/index.html` L301). A saved unlock in browser storage (`musicPlannerAuth` / `bishopricHubAuth`) is restored only when Firebase still has a live passkey or text-code sign-in for the same leader; personal-password ('pw_') sessions alone never count, and ward-password unlocks no longer survive a reload. `public/js/music-coordinator.js`: `onAuthStateChanged` import (L18), helpers `waitForAuthReady` / `liveSignInLeaderName` / `restoreSavedMusicUnlock` before `initMusicLoginGate`, cookie block now prefill-only.
- Version line at the bottom of the Music Planner sign-in card (`public/music/index.html` L438, `#music-gate-version-label`), set from `MUSIC_PLANNER_VERSION`.
- Versions 1.2.83 (package.json, package-lock.json, ward.json, `?v=` tags, footers, constants). `npm run check` passed. Backup `.bw_home_1.2.83_20261123/`. Not committed.

## 1.2.82 — November 23, 2026 (PRODUCTION ~12:22 AM ET; staged to test 12:21 AM ET; Duane approved)

- **Name hint wording (Duane, voice, exact dictation):** placeholder → "Enter First & Last Name (e.g. Mahonri Moriancumer)" at `public/index.html` L224 (Bishopric Hub pop-up name box), `public/admin/index.html` L1168 (Add Ward Leader name), `public/music/index.html` L345 and L388. Sign-in error messages at `public/admin/admin-app.js` L944 and L1776 left unchanged ("Please type both your first and last name.").
- Versions 1.2.82 everywhere. `npm run check` 7/7 + site integrity passed. Backup `.bw_home_1.2.82_20261123/`. No rules or functions changes. Not committed.

## 1.2.81 — November 23, 2026 (STAGED to test.blackstoneward.org 12:17 AM ET; production is 1.2.79)

- **Name hints match Bish (Duane, voice 12:16 AM ET, explicit request under the hint-consistency rule):** placeholder → "e.g. Mahonri Moriancumer" at `public/index.html` L224 (Bishopric Hub pop-up name box), `public/admin/index.html` L1168 (Add Ward Leader name), `public/music/index.html` L345 and L388 (previously a ward member's name).
- **Sign-in error text:** `public/admin/admin-app.js` L944 and L1776 now read "Please type both your first and last name." (example name dropped).
- Versions 1.2.81 everywhere. `npm run check` 7/7 + site integrity; `node --check` admin-app.js and home.js passed. Backup `.bw_home_1.2.81_20261123/`. No rules or functions changes. Not committed.

## 1.2.80 — November 23, 2026 (STAGED to test.blackstoneward.org 12:15 AM ET; production is 1.2.79)

- **Hint reverted (Duane, voice 12:14 AM ET):** `public/index.html` L224 back to the original "First and last name (e.g. Duane Harris)" per the new hint-consistency rule. Net result: 1.2.80 is 1.2.79 with only the version number changed. The entry below is kept as history.

- **Generic name hint (Duane, voice 12:08 AM ET):** `public/index.html` L224 `#bishopric-member-name` placeholder changed from "First and last name (e.g. Duane Harris)" to "First and Last Name". It was placeholder text only, never a pre-filled value. Matches BW_Bish 1.1.63 sign-in boxes. No other changes.
- Versions 1.2.80 everywhere. Backup `.bw_home_1.2.80_20261123/`. Not committed.

## 1.2.79 — November 23, 2026 (PRODUCTION 12:10 AM ET; staged 12:07 AM ET; production carries 1.2.77 and 1.2.78 too)

- **Tab order (Duane, 12:04 AM ET):** in the Bishopric Hub dialog the default Phone Text (SMS) tab is now first/left (`public/index.html` L217) and Password Sign-In is right (L218). No behavior, CSS, rules or functions changes.
- Versions 1.2.79 everywhere. `npm run check` 7/7 + site integrity passed; `node --check home.js` passed. Backup `.bw_home_1.2.79_20261123/`. Not committed.

## 1.2.78 — November 23, 2026 (STAGED to test.blackstoneward.org 12:03 AM ET; production is 1.2.76)

- **Phone Text (SMS) is the default tab (Duane, 12:01 AM ET):** `public/index.html` L216–217 move `active-tab`/`aria-selected="true"` to the SMS tab; the password form (L220) starts `hidden` and `#bishopric-sms-panel` (L233) starts visible; `public/js/home.js` L457 opens the dialog with `setBishopricTab('sms')`.
- **True tab row:** `public/assets/site.css` L151–155 (scoped to `#bishopric-lock-dialog`): tabs no longer spread to opposite ends; both are equal-width folder tabs in one row, the unselected tab has its own tinted background and border, the selected tab joins the white panel.
- Password path, Touch ID button and SMS hand-off to bish.blackstoneward.org unchanged. No rules or functions changes. Versions 1.2.78 everywhere. `npm run check` 7/7 + site integrity passed; `node --check home.js` passed. Backup `.bw_home_1.2.78_20261123/`. Not committed.

## 1.2.77 — November 22, 2026 (STAGED to test.blackstoneward.org 11:59 PM ET; production is 1.2.76)

- **Tabbed Bishopric Hub sign-in on the home page (Duane, voice 11:51 PM ET):** the `#bishopric-lock-dialog` (`public/index.html` L202–239) now has Touch ID on top and two tabs, Password Sign-In and Phone Text (SMS) (L215–216). The SMS tab panel `#bishopric-sms-panel` (L232–235) replaces the stacked "Prefer a text code?" link and hands off to bish.blackstoneward.org, whose sign-in opens on its Phone Text (SMS) tab. `public/js/home.js` `setBishopricTab()` (L463–487: click + arrow keys) and the dialog opens on Password each time (L457). Password and Touch ID paths unchanged.
- Versions 1.2.77 everywhere. `npm run check` 7/7 + site integrity passed. Backup `.bw_home_1.2.77_20261122/`. No rules or functions changes. Not committed.

## Functions 1.2.4 (passkeyApi 1.3.0) — November 22, 2026 (LOCAL ONLY, Code Complete; not deployed; live passkeyApi 1.2.0)

- **`POST /password/login` for Bishopric Hub personal passwords (Duane, voice 11:45 PM ET):** `functions/index.js` L509–624 + route L653–654. Finds the active `ward_leaders` record by display name (Admin SDK), compares the stored unsalted SHA-256 `passwordHash` with the typed and lower-cased password (timing-safe), requires a bishopric record when `requiredRole` is `bishopric`, and mints a custom token for uid `pw_<leaderId>` with claim `pw: 1` (no role/leaderId claims). Rules treat it as a non-leader session (no `ward_leaders/pw_*` doc), so no rules change. Generic errors only; no record data returned. Rate limits in `pw_login_rate_limits` (30/IP/hour, 5 failed tries per name/hour), fail closed (503).
- Tests: `BW_Platform/test-results/pw-login-20261122-235302.txt` 11/11; `passkey-enroll-20261122-235329.txt` 22/22. Backup `.bw_home_functions_pwlogin_20261122/`.
- Deploy ONLY with `firebase deploy --only functions:passkeyApi` from BW_Home (live production change, separate "Approved").

## 1.2.76 — November 22, 2026 (PRODUCTION 11:48 PM ET; staged 11:47 PM ET; production carries 1.2.74 and 1.2.75 too)

- **Leader list denial is now a pop-up (Duane, voice 11:40 PM ET):** when the full `ward_leaders` read is denied for any sign-in without roster access (password, authenticator app or Google), `showLeadersLoadDenied()` (`public/admin/admin-app.js` L699–712) opens the new `#leaders-denied-modal` (`public/admin/index.html` L1381–1392) through `openLeadersDeniedModal()` (L689). The pop-up uses Duane's dictated wording (voice 11:41 PM ET): "You have logged in successfully. In order to see the list of authorized users, you need to log out and log back in with your Touch ID that you've enabled." It opens once per denial (`leadersDeniedPopupShown`, reset when a list read succeeds at L2195) and closes with OK, Escape or the shared `closeModals()` (L4605).
- The red table text is replaced by one neutral line ("Leader list not shown for this sign-in.") so the table never looks like it has no users. The 1.2.75 Google-only message and `isGoogleSession()` are removed: every sign-in now gets the same pop-up. `LEADERS_LOAD_DENIED_MSG` (L639) is no longer used and was left in place.
- No `firestore.rules`, functions or data changes. Versions 1.2.76 everywhere. `npm run check` passed. Backup `.bw_home_1.2.76_20261122/`. Not committed.

## 1.2.75 — November 22, 2026 (STAGED to test.blackstoneward.org 11:36 PM ET; production is 1.2.73)

- **Clearer passkey message (Duane, voice 11:34 PM ET):** `public/admin/admin-app.js` L1378, the `InvalidStateError` alert now says this device already has your passkey, so just sign in with Touch ID. The old text wrongly said an administrator must clear an old server passkey. Logic unchanged.
- **Leader list under Google sign-in:** new `LEADERS_LOAD_DENIED_GOOGLE_MSG` and `isGoogleSession()` (L684–689, checks `auth.currentUser.providerData` for `google.com`). `showLeadersLoadDenied()` (L699) shows that message instead of the generic denied text when a Google session's full `ward_leaders` read is denied (L2248 listener error path, and L3757 re-render). Other sign-ins keep `LEADERS_LOAD_DENIED_MSG`.
- No `firestore.rules`, functions or data changes. Versions 1.2.75 everywhere (package, lockfile, `ward.json`, footers, `?v=`). `npm run check` passed. Backup `.bw_home_1.2.75_20261122/`. Not committed.

## 1.2.74 — November 22, 2026 (STAGED to test.blackstoneward.org 11:18 PM ET; production is 1.2.73)

- **Google sign-in reads only its own leader record (Duane, voice 11:06 PM ET):** `public/admin/admin-app.js` `handleGoogleSignIn()` (L1643) now runs `getDocs(query(collection(db, "ward_leaders"), where("email", "==", want)))` (L1680) with `want` = the Google email trimmed and lower-cased (L1677), instead of reading the whole `ward_leaders` collection. The match filter (active, email), the 0 / more-than-1 checks, the Home gate and the session setup are unchanged; phone, passkey and password paths unchanged. No as-typed fallback: the rules compare against the lower-cased token email and all stored leader emails are lower-case (read-only count 11:08 PM ET: 0 of 6 not lower-case/trimmed).
- Needs the BW_Platform 0.5.4 rules draft `prod-rules/firestore.rules.draft-20261122-google` (sha256 `cc81695b234d…`) live first; with today's live rules (3366b4c0) the Google query is denied exactly as the full read is now (same "leader list couldn't be checked" message), so shipping Home first does no harm but fixes nothing.
- Versions 1.2.74 everywhere (package, lockfile, `ward.json`, footers, `?v=`). `npm run check` passed. Backup `.bw_home_1.2.74_20261122/`.
- Tests (emulator, FAKE data): `BW_Platform/test-results/google-leader-read-20261122-231111.txt` 37/37 (new test 18); full suite `run-20261122-231134.txt` 177/182 (same 5 pre-existing failures as `run-20261122-211334.txt`); test 15 with the google draft `rules-tighten-google-draft-vs-live-20261122-231129.txt` 74/76 (same 2 intended td differences as the td draft); `passkey-enroll-20261122-231205.txt` 22/22; `td-reschedule-20261122-231225.txt` 34/34.
- **Deploy order (each step its own "Approved"):** Status: (1) rules LIVE 11:17 PM ET (cc81695b); (2) staged 11:18 PM ET; (3) production pending approval. (1) rules from BW_Youth (live production change; staging shares the live Firestore). (2) Home 1.2.74 `firebase deploy --only hosting:staging`, test Google sign-in + Enable passkey on test.blackstoneward.org. (3) Home 1.2.74 production `--only hosting:blackstoneward`.

## Functions 1.2.3 (passkeyApi 1.2.0) — November 22, 2026 (LOCAL ONLY, Code Complete; not deployed; live functions: passkeyApi 1.1.0, td 1.2.2)

- **Google sign-in may add a passkey (Duane, voice 10:58 PM ET):** `functions/index.js` `verifyEnrollCaller()` also returns the token email (trimmed, lower-case) and `email_verified`; `enrollAllowed()` accepts a `google.com` session whose Google-verified email equals the leader record's `email` (trimmed, case-insensitive). Text (phone) and passkey (custom) paths unchanged; same 401 then 403 order; /register/verify re-checks and keeps the challenge bound to the same sign-in. Sign-in messages mention Google.
- `functions/package.json` / lockfile 1.2.2 → 1.2.3. Backup `.bw_functions_1.2.3_20261122/`.
- Tests (local emulators, synthetic records): `BW_Platform/test-results/passkey-enroll-20261122-230059.txt` 22/22 (new T19–T22: Google match enrolls end to end; other leader 403; unverified email 403; verify from another Google sign-in 403). td suite `td-reschedule-20261122-230015.txt` 34/34.
- **Not enough on its own:** Home's Google sign-in reads the whole `ward_leaders` collection (admin-app.js ~L1670) and the live rules (BW_Youth/firestore.rules L101–104) do not let a Google session read it, so Google sign-in stops at the leader check before enrollment. Needs a rules addition (Google session reads its own record by verified email) plus a Home client change (query by email). Not built.
- **Deploy (needs Duane's "Approved"):** `cd zzWeb/BW_Home && firebase deploy --only functions:passkeyApi --project blackstoneward-b861c`.

## Functions 1.2.2 — November 22, 2026 (LOCAL ONLY, Code Complete; not deployed; 1.2.1 was never deployed; live functions are 1.2.0)

- **/td shows household + member names, as the old page did (Duane, chat 10:50 PM ET):** `functions/td.js` `publicSlot()` also copies `members` onto booked slots in `td_public/<year>`; open slots carry neither. householdId, emails, notes, contacts and unassigned stay out. The /td page already renders `slot.members` under the household name; no hosting change (Home stays 1.2.73). Rules unchanged.
- `functions/package.json` / lockfile 1.2.1 → 1.2.2. Tests: `BW_Platform/test-results/td-reschedule-20261122-225105.txt` 34/34; `td-e2e-20261122-225134.txt` 13/13.

## Functions 1.2.1 — November 22, 2026 (LOCAL ONLY, Code Complete; not deployed; hosting stays 1.2.73, live functions are 1.2.0)

- **/td shows household names again (Duane, voice 10:46 PM ET):** `functions/td.js` `publicSlot()` (L50–59) now copies the household name onto booked slots in `td_public/<year>`; open slots carry none. householdId, members, emails, notes, contacts and unassigned stay out. Header comment L7–8 and L66 updated. The /td page already shows `slot.household` (falls back to "Reserved"), so no hosting change. Rules unchanged (`td_public` public read, no client writes).
- `functions/package.json` and `package-lock.json` 1.2.0 → 1.2.1. Backup `.bw_functions_1.2.1_20261122/`.
- Tests (local emulators, synthetic data): `BW_Platform/test-results/td-reschedule-20261122-224719.txt` 34/34 (public view: household on booked slots only, no other PII); `td-e2e-20261122-224845.txt` 13/13.
- **Deploy (needs Duane's "Approved"):** `cd zzWeb/BW_Home && firebase deploy --only functions:tdPublicSync,functions:tdReschedule --project blackstoneward-b861c`, then one SAVE in Bish to rebuild `td_public/2026`.

## 1.2.73 — November 22, 2026 (LOCAL ONLY, Code Complete; not staged or deployed; production is 1.2.72)

- **Safe /td tithing reschedule (Duane, voice 10:06 PM ET):** the public page no longer reads or writes the full schedule doc (household names, members, emails, notes). `public/td/index.html`: reads the sanitized `td_public/2026` view (1376–1379), moves go through the new `tdReschedule` Function (`TD_API_URL` 1322; `handleMoveToOpenSlot` 2370–2444, POST at 2416) which checks the family name + an email on file and moves the appointment in a server transaction; no client write (`setDoc` import removed). The gate checks the name on the server when the page data has no names (`tdServerHouseholdCheck` 2585, gate 2624). The email autofill was removed (the email field is never prefilled). Booked rows show "Reserved" instead of a family name (1644, 1887–1888, 1964); the embedded fallback JSON (532–1294) and `public/data/tithing-declaration.json` were sanitized (no names, members, emails or notes). Otherwise the UI is unchanged.
- **Functions package 1.2.0 (`functions/td.js` new, 306 lines; `functions/index.js` 3, 541–551):** `tdReschedule` (HTTP, CORS for ward/Firebase/localhost origins, POST only, actions `check` and `move`, rate limits 40/IP/hour and 5 wrong emails per household per hour) and `tdPublicSync` (Firestore trigger on `home_content/{docId}` that rebuilds `td_public/<year>` from `tithing_declaration_<year>`). The move transaction checks household, email on file (refuses with a contact-the-bishopric message when none is on file), target slot exists / open / TD-open / not past (Eastern), clears the old slot the way the page did (incl. the unassigned list), assigns the target, recounts, sets `updatedBy`/`updatedAtIso`, updates only those fields and writes the public view in the same transaction. Responses carry no member data.
- Versions 1.2.73 everywhere (package, lockfile, `ward.json`, footers, `?v=`). `npm run check` passed. Backup `.bw_home_1.2.73_20261122/`.
- Tests (local emulators only, synthetic data, demo projects): function + rules `BW_Platform/test-results/td-reschedule-20261122-222213.txt` 34/34; headless /td E2E `BW_Platform/test-results/td-e2e-20261122-222557.txt` 15/15; rules test 15 vs the old draft 76/76 (`BW_Platform/test-results/rules-tighten-draft-vs-live-20261122-222658.txt`) and vs the td draft 74/76 (`BW_Platform/test-results/rules-tighten-td-draft-vs-live-20261122-222658.txt`; the 2 'failures' are the intended change: public read and update of `tithing_declaration_2026` are now denied); per-person 210/0 with the td draft (`BW_Platform/test-results/leaders-per-person-td-20261122-222658.txt`, names redacted).
- **Deploy order (each step its own "Approved"; nothing deployed):** (1) Functions, LIVE the moment it lands: `cd zzWeb/BW_Home && firebase deploy --only functions:tdReschedule,functions:tdPublicSync --project blackstoneward-b861c` (never broader: BW_Home and BW_Youth share the `default` codebase; first Firestore trigger may need the Eventarc API and the trigger region must suit the database location); then one leader save in Bish (or any write to the schedule doc) builds `td_public/2026`. (2) Bish 1.1.62 staging → production. (3) Home 1.2.73 staging → production. (4) Rules LAST: `prod-rules/firestore.rules.draft-20261122-td` copied to `BW_Youth/firestore.rules` and deployed from BW_Youth (live production change; rollback = the current a528ed92 file).

## 1.2.72 — November 22, 2026 (LOCAL ONLY, Code Complete; not staged or deployed; production is 1.2.71)

- **No "Enable Touch ID" prompt after a passkey sign-in (Duane, voice 9:56 PM ET):** in a fresh browser profile (incognito, new device) `wardPasskeyRegistered` is empty, so `maybeShowPasskeyOnboardingPrompt()` offered to enable a passkey to someone who had just signed in with one. `public/admin/admin-app.js`: early `if (isPasskeySession()) return;` at the top of `maybeShowPasskeyOnboardingPrompt()` (1382) and the same guard in its 700 ms re-check (1395). Text sign-ins without the flag still get the prompt.
- **Enroll button/banner:** `updatePasskeyEnrollButton()` now records `wardPasskeyRegistered` (`{ rpId, source: 'passkey-sign-in', seenAt }`) when the session is a passkey sign-in and the flag is missing (1174–1175), so the banner hides and the button reads Refresh. Only the flag's presence is read in admin-app.js; the music planner ignores entries without `rawId`; a later failed passkey sign-in still clears it (existing behavior).
- Versions 1.2.72 everywhere (package, lockfile, `ward.json`, footers, `?v=`, music planner). `npm run check` passed. Backup `.bw_home_1.2.72_20261122/`.
- Tests (local emulators only): headless E2E `BW_Platform/test-results/home-1272-passkey-prompt-e2e-20261122-215832.txt` (fresh profiles; passkey sign-in: prompt shown on 1.2.71, not shown on 1.2.72; text sign-in: prompt shown on both; 1.2.71 listener checks still pass); rules test 15 76/76.

## 1.2.71 — November 22, 2026 (LOCAL ONLY, Code Complete; not staged or deployed; production is 1.2.70)

- **Users & Access list empty after signing in again in the same tab (Duane, chat 9:39 PM ET):** `initSubscriptions()` only ever ran once per page (`if (unsubEvents) return;`), `handleLogout()` never stopped the Firestore listeners, and a `ward_leaders` listener that got permission-denied (for example before the `leader_sessions` tie existed, or after sign-out) stayed dead with `leadersTableDenied` stuck. New `resetSubscriptions()` in `public/admin/admin-app.js` (2073–2080) stops and clears `unsubEvents`/`unsubAnn`/`unsubSpot`/`unsubLead` and resets `leadersTableDenied`. It is called in `handleLogout()` after `signOut` (1884), after a successful text sign-in and its session tie, before `checkAuth()` (1108), and after a passkey sign-in before `checkAuth()` (autofill 1289, button 1466). The leaders listener error handler now clears `unsubLead` (2236). Password and Google sign-in paths unchanged (scope lock).
- Versions 1.2.71 everywhere (package, lockfile, `ward.json`, footers, `?v=`, music planner). `npm run check` passed. Backup `.bw_home_1.2.71_20261122/`.
- Tests (local emulators only, demo projects): headless Chrome E2E sign-in → logout → sign-in → reload, 1.2.70 reproduces the empty list on the 2nd sign-in and 1.2.71 passes all checks (`BW_Platform/test-results/home-1271-listener-e2e-20261122-214519.txt`); rules test 15 76/76; per-person 210/0.

## 1.2.70 — November 22, 2026 (LOCAL ONLY, Code Complete; not staged or deployed; includes the unstaged 1.2.69)

- **Passkey enrollment requires a real sign-in (Duane, voice 9:04 PM ET):** `functions/index.js` → passkeyApi **1.1.0**: `/register/options` and `/register/verify` now require `Authorization: Bearer <Firebase ID token>` (verified with `verifyIdToken(token, true)`, so revoked/expired tokens fail). Allowed: a passkey (custom-token) session whose uid is the leader doc id, or a text-message session whose verified number matches the leader record's phone (same 14 formats as the tightened rules); the record must exist and be active (no more synthetic profiles). 401 = no/invalid sign-in, 403 = not this leader / no active record, with a JSON `code`. The options challenge stores the caller uid; `/register/verify` re-checks the sign-in, the uid and the record BEFORE consuming the challenge, so rejected calls cannot burn or swap it. Login endpoints unchanged. `functions/package.json` (+ lock) version 1.1.0.
- **Client:** `public/js/passkey-client.js` sends the ID token on the two register calls only and refuses to call the server without one (`PASSKEY_SIGNIN_REQUIRED_MSG`); `public/admin/admin-app.js` `handleEnrollPasskey` shows "Sign in by text message first to add a passkey…" when there is no Firebase sign-in (master/personal-password sessions) and passes `auth.currentUser.getIdToken()`.
- Versions 1.2.70 everywhere (package, lockfile, `ward.json`, footers, `?v=`). `npm run check` passed. Backup `.bw_home_1.2.70_20261122/`.
- **Deploy note:** `passkeyApi` runs in the shared project `blackstoneward-b861c`, so deploying it is a LIVE production change for every hub (beta and production) the moment it lands, even while the hubs are only staged on test.blackstoneward.org. Order: stage + promote the hub builds first (they work with the current function too), then deploy the function under a separate "Approved": `cd zzWeb/BW_Home && firebase deploy --only functions:passkeyApi --project blackstoneward-b861c` (always `--only functions:passkeyApi`; BW_Home and BW_Youth share the Functions codebase `default`, so a broader functions deploy can delete `sendFeedbackEmail`). After that deploy, older hub builds can still sign in with passkeys but can no longer add one (401).
- Tests (emulator only, demo project): `BW_Platform/test-results/passkey-enroll-20261122-211511.txt` 18/18; rules test 15 76/76 (`rules-tighten-draft-vs-live-20261122-211415.txt`); per-person 210/0 (`leaders-per-person-20261122-211415.txt`); full suite 177/5, the same 5 pre-existing failures (`run-20261122-211334.txt`).

## 1.2.69 — November 22, 2026 (LOCAL ONLY, Code Complete; not staged or deployed)

- **Works under the tightened rules draft (Duane, voice 12:20 AM ET; `BW_Platform/prod-rules/firestore.rules.draft-20261122-tighten`, NOT deployed):** after a text-message sign-in, `/admin` reads only the caller's own `ward_leaders` record (`findLeadersByVerifiedPhone`: `where("phoneNumber", "in", leaderPhoneVariants(phone))`) instead of the whole roster, then binds `leader_sessions/{uid}` (`bindLeaderSession`) so the rules can treat the session as that leader (roster view for Home admin seats, content saves). The empty-collection auto-bootstrap is removed (it could no longer tell an empty collection from an unknown phone, and SMS sessions can't write `ward_leaders`). Music Planner does the same after its text sign-in (`bindVerifiedPhoneSession`).
- **Visible save failures:** Home announcement/spotlight saves and deletes, and Music Planner saves, now show a clear message on permission-denied (master-password and personal-password sign-ins have no Firebase session and can't save site content once the rules are live) instead of failing silently. Leader-list denied message now mentions the Home admin seat.
- Compatible with the current live rules (the `leader_sessions` bind is just refused there). `npm run check` passed. Synchronized package, root lockfile entries, `public/data/ward.json`, footers and all `?v=` cache-busts to v1.2.69. Backup `.bw_home_1.2.69_20261122/`. No commit or push.

## 1.2.68 — November 21, 2026 (STAGED 11:58 PM ET; PRODUCTION blackstoneward.org 2026-11-22 12:01 AM ET)

- **Access Matrix Save requires a Firebase passkey session (Duane, voice 11:34 PM ET):** `handlePasskeyLogin` no longer marks a passkey session when `customToken` is missing or `signInWithCustomToken` throws. The leader sees "Passkey verified, but Firebase sign-in failed (<short code>). Please try again." and the short error code is logged once. Before the Save transaction, `callingSaveAuthState()` requires `auth.currentUser`, `getIdTokenResult()` `sign_in_provider === 'custom'`, and `uid === profile.id`. The single 1.2.67 "Saving online needs the Firestore rules update (awaiting approval)…" denial is replaced by three messages: not signed in to Firebase; requires a passkey session; passkey session but not permitted (need an active Web Administrator or Bishop). Non-secret uid and provider go to `console.info` only. Copy row and Download CSV are unchanged.
- **Read-only Function/IAM/log check (no IAM or Functions changes):** the deployed gen2 `passkeyApi` (us-central1, nodejs22, updateTime 2026-11-18 11:10:03 AM ET) is byte-identical to local `BW_Home/functions/index.js` (sha256 `cb4e8037c6901eecb819d25ceeb0381ed919bc57324eccb1a0152967840771c5`). It does return `customToken` minted with `uid = profile.id || leaderId || credentialId`, but on mint failure it still returns HTTP 200 with `customToken: null`. Cloud Logging at 2026-11-21 11:38:02 PM ET shows `createCustomToken` failed: `iam.serviceAccounts.signBlob` denied. The function runtime SA (`609425206588-compute@developer.gserviceaccount.com`) has project Editor, not Service Account Token Creator; Editor/Owner do not include `signBlob`. IAM and Functions were not changed (need approval).
- Synchronized package, root lockfile entries, `public/data/ward.json`, footers and all `?v=` cache-busts to v1.2.68. LOCAL ONLY, Code Complete; not staged or deployed. No commit or push.

## 1.2.67 — November 21, 2026 (staged on test.blackstoneward.org 10:29 PM ET; production on blackstoneward.org 10:52 PM ET)

- **Access Matrix Save writes callings to Firestore (Duane, voice 10:20 PM ET):** the Add/Edit Calling modal gained a Save button, gated by the existing `canManageCallings()` (RC1 Web Administrator or RC2 Bishop). Save writes `ward_permissions_roles/{RC}` in a transaction, matching the importer schema (name, label, org codes, areas, plus derived `dropdownOrgs`, `homeSeat`, `youthAreas`/`youthAreaNames`, `legacyRole`/`legacyOrg`, etc.), updates `ward_permissions_meta/current` (`roleIds`, `roleCount`, `groups`, `updatedAt`, `updatedBy`), and appends an add-only `ward_permissions_history` entry (`action` add/update, who, when, before/after). After a successful save, the in-memory catalog, Access Matrix table and Calling dropdown refresh (`loadCallingCatalog`). The Access Matrix prefers the Firestore catalog when it loaded, and falls back to the bundled `permissions.json` (same as 1.2.66). If the write is denied (live rules for `ward_permissions_*` are not deployed), the modal shows "Saving online needs the Firestore rules update (awaiting approval). Use Download CSV for now." Copy row and Download CSV still work. User-facing "Permissions-v3.xlsx" wording now says Permissions_v6.xlsx.
- **Rules drafts (NOT deployed):** `BW_Platform/prod-rules/ward-permissions.rules.draft` and `ward-permissions.rules.claims-draft` keep RC1/RC2 passkey-only writes and add tighter field/type checks on role, meta and history documents. Emulator tests extended in `tests/14-permissions-firestore.test.js` and re-run in the local Firestore emulator: **18/18 PASS** (`BW_Platform/test-results/permissions-emulator-20261121-222712.txt`). A rules deploy would still be a live production change for every hub and is not part of this build.
- Synchronized package, root lockfile entries, `public/data/ward.json`, footers and all `?v=` cache-busts to v1.2.67. Staged to test.blackstoneward.org at 10:29 PM ET. Production hosting-only deploy to blackstoneward.org at 10:52 PM ET (`firebase deploy --only hosting:blackstoneward --project blackstoneward-b861c`); no rules or Functions in this deploy (live ruleset already `005abacc-a5fb-45a3-8c04-5c933b2848d7` from 10:48 PM ET). No commit or push.

## 1.2.66 — November 21, 2026 (staged on test.blackstoneward.org 10:06 PM ET; production on blackstoneward.org 10:19 PM ET)

- **Calling / Leadership Position dropdown from Firestore with fallback (Duane, chat 9:57 PM ET):** `#leader-calling` in `public/admin/index.html` no longer lists hard-coded options. At runtime `admin-app.js` builds one optgroup per org (Orgs-tab order, empty orgs skipped) from `ward_permissions_meta/current` plus `ward_permissions_roles`, with roles sorted by RC number and dual-org callings (Bishop, Bishopric 1st/2nd Counselor) listed under each of their orgs, all saving the same calling value. The read uses a ~4 s timeout; if it is denied (live rules still block `ward_permissions_*`), fails, or times out, the same grouped list is built from the vendored `public/js/permissions/permissions.json`. One `console.info` records the source; errors are not spammed. Old Youth Hub names are retired from the dropdown. An existing leader whose saved calling is not a v6 name opens with a disabled `(retired: <name>) — pick a v6 calling` option; Save leaves calling, accessAreas, role, org and rcCodes unchanged unless a v6 calling is picked. `HOME_ADMIN_LEGACY_CALLINGS` and the sign-in gate are unchanged. Youth `role` / `org` / `accessAreas` for a picked v6 calling come from the catalog (`legacyRole`, `legacyOrg`, `youthAreaNames`). Gate seats still take `rcCodes` from `HOME_ADMIN_SEATS` (plus owner seats); other v6 callings now also store their RC code from the catalog.
- Synchronized package, root lockfile entries, `public/data/ward.json`, footers and all `?v=` cache-busts to v1.2.66.
- **Status:** staged on test.blackstoneward.org 2026-11-21 10:06 PM ET (`hosting:staging`). Production deployed to blackstoneward.org 2026-11-21 10:19 PM ET (`hosting:blackstoneward` only). A first production upload failed with a content-hash mismatch and was not released (live site stayed 1.2.50); the same command was retried and released. No Firestore writes, functions/rules, commits, or pushes.

## 1.2.65 — November 21, 2026 (LOCAL ONLY, not staged)

- **Passkey enroll flow (Duane, voice 8:57 PM ET):** while `enrollCloudPasskey(...)` runs (browser prompt plus server verify), disable the Enable/Refresh enroll buttons (`#btn-enroll-passkey`, `#btn-enroll-passkey-banner`, `#btn-prompt-enable-passkey`) and show "Saving passkey to server…" on their labels; clear that state in a `finally` block on success or failure. After a successful enroll, keep the localStorage flag and success alert, then call `checkAuth()` so the admin dashboard is shown as the signed-in leader. Enroll is blocked when there is no stored `wardLeaderProfile`, the tab is not a signed-in leader session, or the profile is break-glass / 'Master Admin'; the generic `{ displayName: "Ward Leader", role: "admin", phoneNumber: "admin" }` fallback is removed. The onboarding modal stays visible until enroll succeeds so the saving state can be seen.
- **Enable Touch ID button in Chrome incognito (Duane, voice 9:02 PM ET):** `initBiometricUI` no longer hides `#passkey-login-container` when `isUserVerifyingPlatformAuthenticatorAvailable()` returns false or throws (Chrome incognito often reports false even when `window.PublicKeyCredential` exists). After that async check it calls `updatePasskeyEnrollButton()` again. For a real signed-in leader (not break-glass), `#btn-enroll-passkey` and `#passkey-enroll-banner` (when there is no `wardPasskeyRegistered` and the banner has not been dismissed) are shown even if the UVPAA check fails; the banner is force-unhidden the same way as the header button. Fixes 1–3 are unchanged. Still v1.2.65; no version bump, deploy, commit, or push.
- Includes 1.2.64 (LOCAL ONLY, never staged): clear stale local passkey flags after a non-cancel login failure or an already-registered enroll error, and tell the leader an admin must clear an old server passkey.
- Synchronized package, root lockfile entries, `public/data/ward.json`, footers and all `?v=` cache-busts to v1.2.65. No deploy, commit, push, Firestore writes, or functions/rules changes.

## 1.2.64 — November 21, 2026 (LOCAL ONLY, not staged)

- **Stale local passkey flags (Duane, voice 7:50 PM ET):** if a passkey sign-in fails in `handlePasskeyLogin` for any reason other than a user cancel (`NotAllowedError`), or if enrollment fails with `InvalidStateError` / "already registered" (the authenticator already contains a credential the server listed), clear `localStorage` `wardPasskeyRegistered`, plus `wardPasskeyPromptDismissed` and `wardPasskeyBannerDismissed` so the one-time prompt and banner can reappear. Then call `updatePasskeyEnrollButton()`. On the already-registered enroll path, tell the leader the server still has an old passkey for this account and an administrator must clear it.
- Synchronized package, root lockfile entries, `public/data/ward.json`, footers and all `?v=` cache-busts to v1.2.64. No Firestore deletes and no functions/rules changes.

## 1.2.63 — November 21, 2026 (staged on test.blackstoneward.org 7:39 PM ET)

- **Enable/Refresh Touch ID button (Duane, chat 7:11 PM ET, top priority):** after SMS or Google sign-in on test 1.2.62 the header `#btn-enroll-passkey` never appeared. `updatePasskeyEnrollButton` did run from `checkAuth` on those paths, but (1) it returned immediately when `window.PublicKeyCredential` was missing, leaving the button's initial `hidden` class in place, and (2) the sticky header row does not wrap, so after the identity badge appears the Enable/Refresh control can sit off-screen to the right. 1.2.63 un-hides the header button after every leader sign-in (passkey, SMS, personal password, Google) without a PublicKeyCredential gate, forces `display: inline-flex`, wraps the header, and adds a full-width can't-miss banner under the header when this device has no passkey (dismissible once). Break-glass master-password sessions do not get the button or banner. The existing first-login passkey modal is still offered once when there is no local passkey.
- **Login name field:** 'Who is logging in?' is a plain text input (SMS and Password tabs). No datalist, no dropdown list, no live name lookup, and no 'Leader Verified' badge or pre-sign-in name/calling. `autocomplete=off` plus `data-1p-ignore` / `data-lpignore`; the field name is not `username`. Conditional mediation / `autocomplete=webauthn` was removed from the name field; passkeys stay on the green Sign In button only.
- **Generic SMS/password failure:** wrong name, phone, code, or password (and a matching deactivated / no-password case on the Password tab) now share one message: "Sign-in failed. Please check your details and try again." Matching still runs only at submit. Empty/format prompts are unchanged. Google and passkey have their own messages.
- **Passkey failure alert:** if the server/client error looks like an unrecognized passkey, the alert says so clearly, still includes `e.message`, and tells the leader to sign in by text, use Refresh Touch ID, and delete old passkeys in Chrome or Apple Passwords.
- **Passkey labels / remove-old-passkeys:** not changed here. `userName` / `userDisplayName` are set in `functions/index.js` (server); a displayName-first label and a 'remove my old passkeys' endpoint need a separate approved functions change.
- Synchronized package, root lockfile entries, `public/data/ward.json`, footers and all `?v=` cache-busts to v1.2.63.

## 1.2.62 — November 21, 2026 (staged on test.blackstoneward.org 6:47 PM ET; production not deployed)

- **Calling column (Duane, chat 6:17 PM ET):** Authorized Users now shows each record's sheet Roles & Callings name(s) (Permissions_v5.xlsx col B: e.g. Bishop, Bishopric 1st Counselor, Web Administrator), bare, from resolved seats via `Access.rcCodesFor`. The stored `calling` text is shown only when there are no resolved seats. Short Calling Labels (col C, e.g. 'Web Admin, Bish') are no longer used as the visible text. The Org column renderer is otherwise unchanged; see the Org item below.
- **Org column (Duane, chat 6:18 PM ET):** org codes come only from those same resolved seats, unioned from each row's sheet Org value. The previous fallback (stored org `bishopric` -> BI only, or other calling/org heuristics) was removed, so a bishopric counselor without a picked seat no longer appears as BI alone. Vendored `permissions.json` (and v5 Roles col E) already lists RC3/RC4 as `BI, YM`; John Truscott and Garrett Bourne have no `rcCodes` and no calling on their records, so they will show — until Duane picks their seats (RC3 / RC4). No sheet change.
- Synchronized package, root lockfile entries, `public/data/ward.json`, footers and all `?v=` cache-busts to v1.2.62.

## 1.2.61 — November 21, 2026 (staged on test.blackstoneward.org 6:17 PM ET; production not deployed)

- **Passkey re-enroll (Duane, chat ~6:06–6:07 PM ET):** after a phone-text (or any) sign-in, the dashboard 'Enable / Refresh Touch ID / Face ID' button stays visible even when `localStorage.wardPasskeyRegistered` is already set, so a leader can re-enroll. On a failed passkey login, the alert now includes the underlying error message (the previous generic 'verification failed' text hid the server/client reason). The 1.2.60 `isPasskeySession` / `setSignInMethod` gate is not on the login-failure path (it runs only after a verified passkey result).
- **Access Matrix (Duane, chat 6:11 PM ET):** the Access Matrix tab stays visible and read-only for everyone who can open Home admin (area 1, RC1–RC6). Add Calling, per-row Edit, and the Copy row / Download CSV export actions show and run only for RC1 (Web Administrator) or RC2 (Bishop), resolved from `rcCodes` through `Access.rcCodesFor` (D3 owner fallback included). The previous `admin`-role shortcut was removed. No master-sheet change.
- Synchronized package, root lockfile entries, `public/data/ward.json`, footers and all `?v=` cache-busts to v1.2.61.

## 1.2.60 — November 21, 2026 (staged on test.blackstoneward.org 5:58 PM ET; production not deployed)

- **Passkey required to add/edit leaders (Duane, chat 5:53 PM ET):** `canUserEditLeader`, `canUserAddLeader`, `canUserDeleteLeader`, and `canUserOnboardLeader` now require a passkey session (`sessionStorage.wardAdminSignInMethod === 'passkey'`). Phone-text, personal-password, Google, and master-password sign-ins can view the Authorized Users list and may still set passwords per D8, but the Add button, Edit, and Onboard actions stay hidden and the existing save/onboard/remove checks refuse the write. The Authorized Users notice matches this. 1.2.58/1.2.60 `canUser*` functions had no sign-in-method check before this fix.
- **Sign-in methods (Duane, chat 5:46 PM ET):** a leader record must have at least one of a valid phone, a personal password (set now or already saved), or an email for Google sign-in. Phone is optional otherwise; a provided phone must still be a valid 10-digit number. The Add/Edit form hints spell this out.
- **Personal passwords re-enabled.** `PERSONAL_LEADER_PASSWORDS_DISABLED` is now `false`, so a leader can sign in on the Password tab with their own password, land in the same session/profile path as SMS, and enroll a passkey. Passwords continue to be stored only as a SHA-256 hex digest in `ward_leaders.passwordHash` (Web Crypto `crypto.subtle.digest`); they are never stored in plaintext. The master password is still checked first and stays D4 break-glass (Home area 1 only, no shared cookie). D8 password-edit rules are unchanged.
- **Sign in with Google** on the Home `/admin` login, using the existing Firebase JS SDK 10.8.0 (`GoogleAuthProvider` + `signInWithPopup`). The Google account's verified email is matched, case-insensitive, to exactly one active `ward_leaders` email; no match or more than one match signs out with a clear message. A successful match uses the same session/profile path as SMS (Home gate, cookie, passkey enrollment, role/area resolution). `auth/operation-not-allowed` (provider not enabled yet) shows a friendly message. The Google provider itself is not enabled by this change.
- **Duplicate phone or email** (email compared case-insensitive) against another active leader is rejected on save.
- **Owner seats on save:** `HOME_ADMIN_OWNER` seats (RC1+RC2) are forced only when saving the owner document `leader_duane_harris`, not when another record shares the owner phone. The D3 read-side backup is unchanged.
- The Authorized Users notice states that a passkey sign-in is required to add or edit leaders; phone text, personal password, and Google can view the list and may set passwords per D8. "Forgot password?" is visible again on the Password tab.
- Synchronized package, root lockfile entries, `public/data/ward.json`, footers and all `?v=` cache-busts to v1.2.60.

## 1.2.59 — November 21, 2026 (LOCAL ONLY, not staged)

- **Add/Edit Ward Leader: removed the Youth Hub Admin Access panel** (Duane, chat 5:26 PM ET). The "Youth Hub Admin Access (youth.blackstoneward.org)" checkbox group (Settings & Privacy, Combined, Priests, Teachers, Deacons, Young Women, Primary, plus "Reset to Calling Defaults") is gone from the modal. Save Leader still works for add and edit: on edit, a record's existing `accessAreas` is left unchanged when the calling is unchanged, so previously saved values are not wiped; on add, or when the calling changes, `accessAreas` is derived from the calling / master-sheet defaults (the same source `syncCallingAccessModal` used). Home seat holders still get Youth areas from the sheet at runtime (`getLeaderAccessAreas`), not from the saved list. The unused `syncCallingAccessModal` helper is left in place; its modal callers were removed.
- **Authorized Users Action menu no longer clipped on the last row** (Duane, chat 5:27 PM ET). The per-row Action dropdown is positioned `fixed` and opens upward when there is not enough space below the button, so the table's `overflow-x-auto` container cannot cut it off. The menu is closed on outside click, scroll, or resize.
- Synchronized package, root lockfile entries, `public/data/ward.json`, footers and all `?v=` cache-busts to v1.2.59.

## 1.2.58 — November 21, 2026 (LOCAL ONLY, not staged)

- **Permissions SSOT phase 2b (Duane, chat 4:50 PM ET).** The hand-typed callings/areas table is gone from `public/admin/admin-app.js`. Seats, Calling Labels, orgs, Restricted Areas, legacy names, the Home gate, roles and password rules now come from the vendored BW_Platform module `public/js/permissions/access.js` (+ `permissions.json`), generated from **`zzRes/Permissions_v5.xlsx`** (read only; sha256 2d766a13…) and copied in with a checksum (`BW_Platform/generated/VENDORED.sha256`). Imported as `../js/permissions/access.js?v=1.2.58`.
- **v5 data:** RC1 Web Administrator = **area 1 only** (`home_admin`); RC2 Bishop = areas 1–24 = `admin`; RC3/RC4 = `bishopric`; RC5/RC6 = `home_admin`; new area 24 = auction.blackstoneward.org/admin.html (RC2–RC6). Access Matrix, Restricted Areas window (24 rows), Add/Edit Calling and labels follow the module.
- **Home gate unchanged:** exactly the seats holding area 1 (RC1–RC6). The cookie still carries a role, now derived by the module (`Access.roleForAreas`), plus the v5 area ids.
- **D3 owner backup:** the owner seats (RC1+RC2) apply only when the owner record has no `rcCodes` and no sheet calling (`Access.rcCodesFor`). An owner record with its own seats is read like any other.
- **D4 master password = break-glass:** signs in as a fixed "Master Admin" profile with Home area 1 only (`home_admin`). It no longer signs in as the owner, merges into no leader record, writes no shared `ward_auth_session` cookie, and opens no other hub. The badge reads "Master password: Home admin only". The marker (`sessionStorage.wardAdminBreakGlass`) is cleared on sign-out.
- **D8 passwords (`canUserChangePassword` → `Access.canEditPassword`):** the master-password session and RC2 Bishop can set any password. RC3/RC4 can set their own and those of users with no RC1–RC6 seat. Everyone else can set only their own.
- `scripts/check-site.js` now also checks that the vendored `access.js` and `permissions.json` match and that the import URL carries the release version.
- Kept: all 1.2.56/1.2.57 features, the "Ward Administrator" legacy alias (→ RC1), and export-only Add/Edit Calling (RC1/RC2/admin). The leader-form calling `<select>` stays static (same six seat names). BW_Youth and BW_Bish were not edited.
- Synchronized package, root lockfile entries, `public/data/ward.json`, footers and all `?v=` cache-busts to v1.2.58.

## 1.2.57 — November 21, 2026 (LOCAL ONLY, not staged)

- **Real Home access now follows `zzRes/Permissions_v4.xlsx` (Duane, voice 4:03 PM ET; Home hub only).** A leader holding a Home seat (RC1–RC6, incl. the owner record and legacy "Ward Administrator") gets exactly the union of the v4 areas of their RC codes / sheet callings (`getHomeSeatAreas`, `getRcAreaUnion`), not a per-person or calling-default list.
- **Role from areas (`resolveSeatRole`, first step of `resolveLeaderRole`)**: all 23 areas incl. RC1 → `admin` (only the owner record, RC2+RC1); all Youth admin areas 7–18 → `bishopric` (RC2, RC3, RC4); otherwise new role **`home_admin`** ("Home Admin", not full access): RC1 Web Admin alone (areas 1, 4, 5, 6, 22, 23), RC5 Ward Clerk and RC6 Exec Sec (1, 2, 4, 5, 22, 23), legacy "Ward Administrator". RC1-only no longer gets the blanket `admin` role.
- **Home admin features for `home_admin`**: can add leaders; can edit / remove / onboard / set passwords only for non-admin leaders whose every area they hold themselves (`getLeaderGrantedAreas`, `canGrantWithin`); `saveLeader` refuses a record that would give areas the signed-in `home_admin` doesn't hold (no self-promotion, no Youth areas). Admin and bishopric rules unchanged. Callings export (RC1/RC2) and Ward Settings access unchanged.
- **Youth area checkboxes for seats** come from v4 (`getLeaderAccessAreas`, `syncCallingAccessModal`): RC1/RC5/RC6 none, RC2–RC4 all 7, with a hint naming the seat's v4 areas.
- **Shared session cookie (`setSSOCookie`)**: carries `areas` (v4 area ids) for seat holders and the area-derived role. A seat holding none of the Bishopric/Youth areas (2, 3, 7–18), i.e. RC1-only, gets **no** `ward_auth_session` from Home, and a stale cookie naming the same user is cleared (`sharedCookieBelongsTo`); other users' cookies are untouched.
- Home gate unchanged (exactly RC1–RC6); owner fallback (`leader_duane_harris` = RC2+RC1) unchanged and still full admin; legacy "Ward Administrator" alias kept (maps to RC1).
- Not changed (other hubs, separate approval): BW_Youth still turns any cookie into a sign-in (unknown roles → Combined) and authorizes direct sign-ins by the stored `ward_leaders.role`; BW_Bish admits by its name roster; `functions/index.js` `isBishopricLeader` uses the stored role. Stored roles change only when a record is re-saved in Home.
- Synchronized package, root lockfile entries, `public/data/ward.json`, footers and all `?v=` cache-busts to v1.2.57.
- Tests: BW_Platform `tests/08` and `tests/09` updated for area-based roles; new `tests/10-home-v4-access.test.js` (RC1-only areas/role/no cookie/Youth+Bish handoff, RC2 1–23, owner full admin, legacy alias, every seat's v4 areas, home_admin subset rule). `scripts/emulators.sh` runs 10.

## 1.2.56 — November 21, 2026 (LOCAL ONLY, not staged)

- **Source: the new `zzWeb/Permissions-v3.xlsx` (Duane confirmed current and said go, voice 3:41 PM ET).** Roles tab now has col C "Calling Label", D Current User, E Org, F areas; 52 callings and 23 restricted areas (counts unchanged).
- **Access Matrix data (`public/admin/admin-app.js` `PERMISSIONS_ROLES`)**: regenerated verbatim from the new Roles tab as `[RC, Roles & Callings, Calling Label, Org, areas]` (Current User still excluded). Changes vs 1.2.55: RC1 "Ward Administrator" → "Web Administrator"; RC15–RC18 "SS …" → "Sun …"; RC23–RC34 (YW Gatherers/Messengers/Builders) area 7 → area 11, and RC26 (previously no areas) now area 11. Sheet spelling "YW pres" kept as-is.
- **Calling Labels shown bare (no RC prefix)**: new `getLeaderRcCodes` / `getLeaderCallingLabels`; the Authorized Users "Calling" column shows the user's label(s) in sheet order (e.g. owner record = "Web Admin, Bish", Bishopric record with `rcCodes: ["RC3"]` = "Bish C1"), full names as a tooltip; records with no sheet row keep showing their saved calling. Legacy full names ("Ward Administrator", "SS President"/"SS Presidency …") map to their RC row for labels (`PERMISSIONS_LEGACY_NAMES`).
- **RC1 rename "Web Administrator"**: `HOME_ADMIN_SEATS.RC1`, the RC1 calling definition, the admin role label, the calling dropdown option and the placeholder texts in `index.html`. Saved records with calling "Ward Administrator" still pass the Home gate (`HOME_ADMIN_LEGACY_CALLINGS`, used by `getHomeAdminSeats`), still resolve to role admin (`resolveLeaderRole`), keep a legacy calling definition, and open in the edit form on "Web Administrator". Home gate stays exactly RC1–RC6 (area 1 unchanged).
- **Users & Access (`public/admin/index.html`)**: nav tab "Authorized Leaders & Users" → "Users & Access"; section header → "Authorized Users"; column "Leader Name" → "Users"; "Organization" → "Org" (narrow column) in both tables; "Website Access Matrix" button → "Access Matrix". The section is now two tabs, **Authorized Users | Access Matrix** (`setLeadersView`; "+ Add Ward Leader" shows on the Authorized Users tab only, still limited to admin/bishopric).
- **Access Matrix tab**: columns RC | Calling (Calling Label, full name tooltip) | Org (i legend) | Accessible Areas | Action. The numbered area icon columns are replaced by one "Accessible Areas" column listing area numbers separated by " • " (tooltip lists each area's site/section). An "i" next to "Accessible Areas" opens a Restricted Areas window (all 23 areas: id, site, section, status). "+ Add Calling" at top right and an Edit button per row, both shown only to RC1/RC2/admin sign-ins (`canManageCallings`).
- **Add Calling / Edit window (`#calling-modal`)**: RC (next free code on add, read-only on edit), full name, Calling Label, Org checkboxes (Orgs tab), Accessible Areas checkboxes 1–23, validation (RC format, duplicate RC, required fields, at least one org). **Save is export-only**: "Copy row" (one CSV row) and "Download CSV" (the whole Roles table with the edit applied; no Current User column). No Firestore write, no local storage, the in-page matrix is unchanged; the window says online saving needs a later Firestore rules change that Duane approves separately.
- Synchronized package, root lockfile entries, `public/data/ward.json`, footers and all `?v=` cache-busts to v1.2.56.
- Tests: BW_Platform `tests/07` and `tests/08` updated for the new sheet layout and RC1 name; new `tests/09-home-access-matrix.test.js` (matrix vs sheet, labels, legacy alias, renames/tabs, export-only save with database calls trapped). `scripts/emulators.sh` runs 09.
- **Spelling fix (Duane, voice 3:54 PM ET)**: RC27–RC30 now read "YW Messengers …" in `PERMISSIONS_ROLES` (the sheet's misspelling corrected in the site only; `Permissions-v3.xlsx` not edited). Not staged before, so the version stays 1.2.56.
- **Master sheet now `BW_Home/zzRes/Permissions_v4.xlsx` (Duane, voice 3:59 PM ET; saved 3:56 PM ET, read-only)**: `PERMISSIONS_ROLES` regenerated from v4's Roles tab; 26 rows changed. Areas 22 and 23 now go to RC1–RC22, RC46–RC49 and RC52 (27 callings; RC52 already had them). RC1 Web Admin = 1, 4, 5, 6, 22, 23 only; RC2 Bish = 1–23; RC3/RC4 add 22, 23; RC5 = 1, 2, 4, 5, 22, 23; RC6 = 1, 2, 3, 4, 5, 22, 23; EQ/RS/Sun/YW/Primary presidencies add 22, 23. RC19 label now "YW Pres". RC27–RC30 "Messengers" now matches the sheet. Orgs and Restricted Areas unchanged. Data table only: the Home gate stays RC1–RC6, and RC1's role/admin behavior is still decided by its calling, not its area list. Tests read v4 (read-only); `zzWeb/Permissions-v3.xlsx` left untouched. Version stays 1.2.56.

## 1.2.55 — November 21, 2026

- **Home admin limited to RC1–RC6 (`public/admin/admin-app.js`, Duane approved 2:25 PM ET, corrected 2:25 PM ET)**: source of truth is `zzWeb/Permissions-v3.xlsx`, Roles tab, column E, area 1 (`blackstoneward.org/admin/`), held only by RC1 Ward Administrator, RC2 Bishop, RC3 Bishopric 1st Counselor, RC4 Bishopric 2nd Counselor, RC5 Ward Clerk and RC6 Ward Executive Secretary. New single allow-list `HOME_ADMIN_SEATS` (RC codes + those calling names verbatim) plus `HOME_ADMIN_OWNER` (owner record = RC2 + RC1 per the confirmed seat manifest), `getHomeAdminSeats`, `isHomeAdminAllowed`, `refuseHomeAdmin`. A record qualifies by an `rcCodes` field (e.g. `["RC3"]`) or an exact spreadsheet calling; the generic `role: bishopric/admin` flag alone does not.
- Enforced after an active-leader match on SMS sign-in, on both passkey paths (autofill and button; the leader's own doc is read for `rcCodes`/`calling`/`active` because the passkey API returns only some fields), and in `checkAuth` for a stored profile. Refusal signs out of Firebase Auth on this site, clears `wardAdminAuth`/`wardLeaderProfile`, never sets or clears the shared `ward_auth_session` cookie (Youth unaffected), and shows: "Home admin is limited to the bishopric. Youth leaders can sign in at youth.blackstoneward.org/admin." Master-password path itself unchanged (its profile is still checked by `checkAuth`); the no-profile owner fallback in `checkAuth` unchanged (flagged as a risk).
- **Leader table (`public/admin/index.html`, `admin-app.js`, Duane approved 2:29 PM ET)**: removed the "Website & Youth Access" column (header and the `accessBadge` cell); empty-state and load-message colspans 8 → 7. Access-area data, edit-form checkboxes, invite text and the Access Matrix panel unchanged. Access Matrix heading "Calling / Leadership" renamed "Calling" (the leader table heading already read "Calling").
- **Data needed before deploy**: the four non-owner bishopric records (1st/2nd Counselor, Clerk, Exec Sec) have no `rcCodes` and calling "Bishopric", so they would be refused until each gets `rcCodes` (RC3/RC4/RC5/RC6). Not written (no Firestore writes).
- Synchronized package, root lockfile entries, `public/data/ward.json`, footers and all `?v=` cache-busts to v1.2.55.
- **RC seat picker (`admin-app.js` calling definitions, `index.html` `#leader-calling`, Duane approved 2:34 PM ET)**: the single "Bishopric" choice is replaced by the six spreadsheet seats verbatim (Ward Administrator = role admin; Bishop, Bishopric 1st Counselor, Bishopric 2nd Counselor, Ward Clerk, Ward Executive Secretary = role bishopric; org bishopric; same Youth access as Bishopric). A legacy "Bishopric" definition stays so existing records resolve and display; the dropdown shows it as "Bishopric (legacy, pick a seat)" and new leaders can't use it. New leaders start at "Select a calling…" (no Bishopric default) and must pick one. Saving writes `rcCodes` from the picked seat (legacy keeps what the record had, a non-seat calling clears it, the owner record always keeps RC2+RC1); `role` stays bishopric/admin so Youth's role logic is unchanged; access areas and other fields are preserved. `resolveLeaderRole` treats the six seats like legacy Bishopric (RC1 → admin). The leader list shows the specific calling.
- **Leader table Organization column with sheet codes**: e.g. "BI, YM", each code with its full name as a tooltip, plus an (i) button in the header that opens a legend of the Orgs tab (WD Ward, BI Bishopric, EQ Elders Quorum, RS Relief Society, YM Young Men, YW Young Women, PM Primary, SN Sunday School, WA Ward Aux, OT Other); keyboard-focusable, Esc / click-outside / tap closes. Colspans 7 → 8.
- **Access Matrix = Permissions-v3.xlsx Roles tab (Duane 2:37–2:41 PM ET)**: all 52 rows RC1–RC52 in sheet order from a static data list (`PERMISSIONS_ROLES`, `PERMISSIONS_ORGS`, `PERMISSIONS_AREAS`, generated verbatim from the sheet 2026-11-21; column C Current User not included). Columns: RC, Calling, Organization (codes + legend), then one column per restricted area 1–21 (header = area number, tooltip = page/region), each cell a green check-circle or a muted empty circle with `aria-label` "Area N: yes/no". RC and Calling stay sticky while the table scrolls sideways. "Youth Status", "Active on Youth Hub" and "Ward Portal Only" removed; subtitle now "Read/write permissions for ward callings across admin areas on all Blackstone Ward hubs." Areas 22–23 (TBD) aren't shown, so RC52's 22/23 appear as none.
- **Status**: staged on test.blackstoneward.org 2026-11-21 2:46 PM ET (`hosting:staging`, Duane approved 2:42 PM ET), production not deployed; not committed or pushed. Served 1.2.55 verified (/, /admin/, /music/ 200; footer, `admin-app.js?v=1.2.55`, ward.json 1.2.55; gate code, 52 matrix rows, seat picker, legend present; no Website & Youth Access, no Youth Status; no placeholder; CHANGELOG 404). Verified before deploy: `node --check`, `npm run check` 7/0, versions synced, no placeholder, Youth tree checksum unchanged; BW_Platform suite 81/0 (`BW_Platform/test-results/run-20261121-144454.txt`) incl. 52-row sheet match, save path, Youth compatibility and rules for saving `rcCodes`.

## 1.2.54 — November 21, 2026

- **SMS sign-in works when the leader list can't load before sign-in (`public/admin/admin-app.js`, Duane approved 2026-11-21 2:15 PM ET)**: If the leader list can't be read before sign-in (permission-denied under the candidate rules, or offline), the SMS name pre-check is skipped and the code is sent; access is then decided only after sign-in from the Firebase-verified phone (active `ward_leaders` match); no match signs the user out with the existing 'not found in registered ward leaders' message, and if the post-sign-in list read itself fails the user is signed out with: "Your phone was verified, but the leader list couldn't be checked, so you weren't signed in. Please try again or use your passkey." The 1.2.53/7.19.7 'a text code can't be sent' message is removed. Under today's open live rules the list loads and the pre-check runs exactly as before. The owner fallback stays keyed to the verified phone only, so a typed name can't unlock anything.
- `LEADERS_PREAUTH_DENIED_MSG` / `leadersPreAuthDenied` replaced by `LEADERS_POSTAUTH_CHECK_FAILED_MSG` / `leadersPreAuthFailed` (set on any pre-sign-in read failure); post-sign-in `getDocs` wrapped so a failure signs out instead of showing 'Incorrect code'.
- Synchronized package, root lockfile entries, `public/data/ward.json`, footers and all `?v=` cache-busts to v1.2.54.
- **Status**: staged on test.blackstoneward.org 2026-11-21 2:20 PM ET (`hosting:staging`, Duane approved 2:16 PM ET), production not deployed; not committed or pushed. Served 1.2.54 verified (/, /admin/, /music/ 200; footer, `?v=`, ward.json; new sign-in code present). Verified: `npm run check` pass, `node --check` pass, BW_Platform emulator suite 68/0 (`BW_Platform/test-results/run-20261121-141841.txt`).

## 1.2.53 — November 20, 2026

- **Leaders table access notice (`public/admin/index.html` `#leaders-access-notice`, Duane approved 4:17 PM)**: plain note under "Authorized Leaders & Users" explaining who can add/edit leaders under the candidate rules.
- **Friendly permission errors (`public/admin/admin-app.js`)**: new `LEADERS_*_DENIED_MSG` strings plus `isPermissionDenied` / `alertLeadersDenied` / `showLeadersLoadDenied` (dated comment block after `PERSONAL_LEADER_PASSWORDS_DISABLED`). Firestore `permission-denied` on leader save, set-password, onboarding marks (single and bulk) now shows an alert; Remove leader and bulk remove suggest turning off Active; a denied `ward_leaders` listener shows a message row instead of an empty/stale table; a denied pre-sign-in roster read changes the SMS "not found" error to a passkey hint. No other logic changed.
- Messages are written for the CANDIDATE `ward_leaders` rules (`BW_Platform/prod-rules/firestore.rules.candidate`), which are NOT deployed; with today's open live rules they simply won't trigger.
- Synchronized package, root lockfile entries, `public/data/ward.json`, footers and all `?v=` cache-busts to v1.2.53.
- **Status**: deployed to staging (`hosting:staging` / test.blackstoneward.org) on 2026-11-20 at 4:24 PM MT (6:24 PM ET) after Duane's approval. Production not deployed; not committed or pushed. `npm run check` passes; permission-denied paths proven in the emulator (`BW_Platform/tests/06-hub-messages.test.js`).

## 1.2.52 — November 20, 2026

- **No browser autofill on sign-in password fields (Duane, 3:07 PM)**: password inputs `#admin-passcode` (`public/admin/index.html`), `#bishopric-password` (`public/index.html` Bishopric dialog) and `#music-gate-password` (`public/music/index.html`) now have `autocomplete="new-password"`, `autocorrect="off"`, `autocapitalize="off"`, `spellcheck="false"`, `data-lpignore="true"` and `data-1p-ignore`. Paired name fields `#password-leader-lookup`, `#bishopric-member-name`, `#music-gate-name` have `autocomplete="off"` plus autocorrect/autocapitalize/spellcheck off (replacing `username webauthn` / `name webauthn`); forms `#login-form`, `#bishopric-lock-form`, `#music-gate-pw-form` have `autocomplete="off"`. Attributes only; ids and JS unchanged; SMS phone fields unchanged.
- Synchronized package, lockfile, `public/data/ward.json`, footers and all `?v=` cache-busts to v1.2.52 (1.2.51 is on staging).
- **Status**: deployed to staging (`hosting:staging` / test.blackstoneward.org) on 2026-11-20 at about 3:22 PM MT after Duane approved on the call. Production not deployed; not committed or pushed.

## 1.2.51 — November 20, 2026

- **Temporary single master password (`public/security-config.js`, `public/admin/admin-app.js`, `public/js/home.js`, `public/spotlights/index.html`)**: Per Duane (2026-11-20), the master hash slots now hold the placeholder `__TEMP_MASTER_HASH__`, which `zzWeb/tools/set-temp-master.sh` fills in on Duane's Mac (site normalization: trim, lowercase, SHA-256). Every org password slot (PRIMARY, PRIESTS, TEACHERS, DEACONS, YW, COMBINED, WARD) and the three other retired master slots are now the non-matchable sentinel `DISABLED-2026-11-20`. Until the script is run, no master password works.
- **Plaintext-credential comments removed (`public/admin/admin-app.js` `AUTHORIZED_MASTER_HASHES`)**: the four trailing comments that disclosed old master passwords were replaced with neutral comments while swapping those slots to the placeholder/sentinel.
- **Personal leader passwords disabled (`public/admin/admin-app.js`, `public/js/home.js`, `public/js/music-coordinator.js`)**: Added `PERSONAL_LEADER_PASSWORDS_DISABLED = true` (dated comment) and short-circuited the `ward_leaders` `passwordHash` comparison, so only the temporary master works on the Password tab. A wrong password shows a normal "Incorrect password" message.
- The `/spotlights` unlock is a family-name privacy gate, not a password gate, so its name list was left unchanged (only its master slots changed).
- **Bishopric Hub-style sign-in tabs**: `/admin` now shows the Touch ID / Face ID button, then folder tabs **Phone Text (SMS)** (default) and **Password Sign-In** (`public/admin/index.html`, `public/assets/admin.css`, `public/admin/admin-app.js`). The tabs click the existing phone/password toggle handlers; no auth logic changed. "Forgot password?" is hidden while personal passwords are off. The home-page Bishopric dialog (`public/index.html`, `public/assets/site.css`) uses the same tab styling with a Password tab only (no SMS code path there) plus a link to text-code sign-in on the Bishopric Hub. `/music/` uses the same tabs (SMS default) driving its existing radios (`public/music/index.html`, `public/js/music-coordinator.js`).
- Synchronized package, content, HTML, and asset version references (including `security-config.js?v=`) to v1.2.51.
- **Status**: deployed to staging 2026-11-20 3:06 PM MT (Duane ran set-temp-master.sh at 3:04 PM). Production still 1.2.50.

## 1.2.50 — November 19, 2026

- **Security Config Comment Cleanup (`public/security-config.js`)**: Removed only the trailing comments on lines 14-17 of `MASTER_APPROVED_HASHES` that disclosed plaintext credentials. Hash values and hashing logic are unchanged.
- **Hosting Ignore Rules (`firebase.json`)**: Added `**/.agents/**`, `**/*.md`, `**/*.bak`, `**/*.log`, `**/*.orig`, `**/*~` to the `staging` and `blackstoneward` hosting ignore lists, keeping the existing entries, so agent rules, docs, backups and logs can never publish. No `.md` file is served by the site. (`BW_Home/public/` had no `.agents/` folder or leftover backup/log files.)
- Synchronized package, content, HTML, and asset version references to v1.2.50.
- Deployed to staging (`hosting:staging` / test.blackstoneward.org) and then to production (`hosting:blackstoneward` / blackstoneward.org) on 2026-11-19 at about 11:50 PM MT, after approval. Not committed or pushed.
- Version housekeeping (2026-11-20): synced secondary version strings/cache-busts to 1.2.50; local only, not deployed.

## 1.2.49 — November 18, 2026

- After explicit approval, deployed `functions:passkeyApi` (`https://us-central1-blackstoneward-b861c.cloudfunctions.net/passkeyApi`, Node.js 22 2nd Gen), live production Hosting (`blackstoneward` / `blackstoneward.org`), and beta Hosting (`test-blackstoneward` / `test.blackstoneward.org`). Verified live delivery of v1.2.49.
- **Shared WebAuthn Cloud Function (`passkeyApi`) & `BW_Home` Passkey Upgrade (`functions/index.js`, `public/js/passkey-client.js`, `public/admin/admin-app.js`, `public/js/home.js`, `public/js/music-coordinator.js`)**:
  - Created Firebase Cloud Function v2 `passkeyApi` (`functions/index.js`) using `@simplewebauthn/server` with `/register/options`, `/register/verify`, `/login/options`, and `/login/verify`, CORS support for all `*.blackstoneward.org` hubs, Firestore challenge/credential storage (`webauthn_challenges`, `ward_passkeys`), live `ward_leaders` role lookup, and Firebase Custom Auth token minting.
  - Added `public/js/passkey-client.js` and upgraded `/admin/`, the Homepage Bishopric lock (`#bishopric-lock-dialog`), and `/music/` to use server-verified cloud passkeys.
  - Updated `firebase.json` and `scripts/check-site.js` to allow the shared `functions` codebase while preserving the Firestore rules guardrail.
- Synchronized package, content, HTML, and asset version references to v1.2.49.

## 1.2.48 — November 14, 2026

- After explicit approval, deployed to live production Hosting (`blackstoneward` / `blackstoneward.org`) and beta Hosting (`test-blackstoneward` / `test.blackstoneward.org`). Verified live delivery of v1.2.48.
- **Hide Past Dates & Add `View Past Dates` Toggle on `/td/` (`public/td/index.html`)**:
  - Added `showPastDates` state (default `false`) and updated `getActiveSundays()` via `getAllPublicSundays()` so past interview dates are hidden by default across the overview strip, interview date cards, month calendar view, and A–Z family directory (while keeping past-date login verification and reschedule lookup functional).
  - Added the `#btn-toggle-past-dates` (`"View Past Dates"` / `"Hide Past Dates"`) button at the top right above the tab rule when past dates exist in the schedule, plus a fallback empty-state prompt when all scheduled dates are in the past.
- Synchronized package, content, HTML, and asset version references to v1.2.48.

## 1.2.47 — November 10, 2026

- After explicit approval, deployed to live production Hosting (`blackstoneward` / `blackstoneward.org`) and beta Hosting (`test-blackstoneward` / `test.blackstoneward.org`). Verified live delivery of v1.2.47.
- **Matched `/admin/` Background Style to `youth.blackstoneward.org/admin` (`public/admin/index.html`, `public/assets/admin.css`)**:
  - Added `currentSeason()` detection in `public/admin/index.html` to set `document.body.dataset.season` (`fall`, `winter`, `spring`, `summer`) and removed the hardcoded `bg-[#FAF6EF]` class on `<body>` so `body.admin-body` uses the seasonal `--cream` background and `--scene` landscape variables.
  - Updated `#login-view` to use `.parallax` with `.scene-image`, `.scene-wash`, and `.admin-login-card` so the login gate displays the seasonal landscape background with radial cream wash and frosted glass card matching `youth.blackstoneward.org/admin`.
  - Updated `#dashboard-view` with the `.admin-hero-banner.parallax` scenic hero banner (`.scene-image` + `.scene-wash`), frosted glass header/footer (`bg-white/88 backdrop-blur-md`), and the `initAdminParallax()` scroll parallax engine with `prefers-reduced-motion` support.
- Synchronized package, content, HTML, and asset version references to v1.2.47.

## 1.2.46 — November 9, 2026

- **Tithing Declaration (`/td`) Compatibility for Universal Interview Manager (`public/td/index.html`)**:
  - Added `isSlotTdOpen(slot)`, `isSlotTdInterview(slot)`, `isPublicVisibleSlot(slot)`, `getPublicTdScheduledCount(sunday)`, and `getPublicTdOpenCount(sunday)` so non-TD scheduled interviews (`!slot.interviewTypes.includes('TD')` or `slot.isNonTdIndividual === true`) and non-TD open slots (`slot.tdOpen === false`) are hidden from the public `/td/` Overview Strip, Interview Schedule cards, Month Calendar, A–Z Family List, and self-service open-slot selector (`#td-form-open-slot`).
  - Updated `handleMoveToOpenSlot()` to preserve `interviewTypes` and `meetingNote` when a TD household moves their appointment and reset `tdOpen: true` on the vacated slot.
- Synchronized package, content, HTML, and asset version references to v1.2.46.

## 1.2.45 — November 6, 2026

- **Added Gated Ward Music Coordinator Page (`/music`) on the Ward Home Site & `Music` Navigation Link (`public/index.html`, `public/music/index.html`, `public/js/music-coordinator.js`, `public/data/hymns-bank-seed.json`)**:
  - Added `<a class="nav-link" href="music/">Music</a>` to the main header navigation (`#main-nav`) on `blackstoneward.org` so the Ward Music Coordinator (**Mio Cowden**) can access the music planner from the unrestricted Home site without needing access to the restricted Bishopric Hub (`bish.blackstoneward.org`).
  - Added `public/music/index.html` and `public/js/music-coordinator.js` styled after the `/td` page with a seasonal parallax login gate restricted to the Ward Music Coordinator and the Blackstone Ward Bishopric, while keeping the Ward Music Coordinator's session (`musicPlannerAuth`) isolated from the Bishopric Hub SSO cookie (`ward_auth_session`).
  - Displays the selected month's **Monthly Sacrament Theme** and a card for **each Sunday of the month** with pull-downs/fields for **Chorister**, **Accompanist**, **Opening Hymn**, **Sacrament Hymn**, **Intermediate Hymn / Special Musical Number** (Hymn pull-down or text field), and **Closing Hymn**, syncing in real time with `bish.blackstoneward.org` via Firestore (`home_content/bishopric_sacrament_v1`).
- Synchronized package, content, HTML, and asset version references to v1.2.45.

## 1.2.44 — November 6, 2026

- After explicit approval, deployed to live production Hosting (`blackstoneward` / `blackstoneward.org`) and beta Hosting (`test-blackstoneward` / `test.blackstoneward.org`). Verified live delivery of v1.2.44.
- **Activated Bishopric Card on Ward Homepage & Enforced Bishopric Access Lock (`public/index.html`, `public/data/ward.json`, `public/js/home.js`, `public/assets/site.css`)**:
  - Activated the **Bishopric** organization card on the Ward Homepage (`organizations.bishopric.ready = true`, linking to `https://bish.blackstoneward.org/`) with `Bishopric Hub` open badge and active card styling.
  - Added `#bishopric-lock-dialog` and `initBishopricLockGate()` on the Ward Homepage so clicking the Bishopric card verifies that the user is an authorized member of the Blackstone Ward Bishopric (`Duane Harris`, `John Truscott`, `Garrett Bourne`, `Cole Houston`, or `Brian McDonald`) via Touch ID / Face ID, active `.blackstoneward.org` SSO session (`ward_auth_session`), or Name + Password before redirecting to `https://bish.blackstoneward.org/`.
  - Confirmed that `https://bish.blackstoneward.org/` has its own `#bish-gate-wrapper` login gate active on the subdomain to protect against direct URL entry while recognizing the shared `.blackstoneward.org` SSO cookie.
- Synchronized package, content, HTML, and asset version references to v1.2.44. All syntax checks, unit tests, and site integrity verifications passed.

## 1.2.43 — November 5, 2026

- After explicit approval, deployed to live production Hosting (`blackstoneward` / `blackstoneward.org`) and beta Hosting (`test-blackstoneward` / `test.blackstoneward.org`). Verified live delivery of v1.2.43 and `/td`.
- **Simplified Tithing Declaration (`/td`) Schedule Change Modal & Added Self-Service Open-Slot Move (`public/td/index.html`)**:
  - Updated the modal subtitle under `"Request a Schedule Change"` to `"Select an open TD slot or Email alternate change request to Executive Secretary, Brian McDonald"`.
  - Removed the `"Members: "` prefix from the household members line in the Current Appointment card (`#td-modal-members-display`).
  - Changed `"Your Phone or Email *"` to `"Household Email"` (`#td-form-contact`) and prepopulated it from the household email stored in Firestore (`home_content/tithing_declaration_2026`).
  - Removed `"What change would you like to propose? *"`, `"Preferred New Date *"`, and `"Preferred Time Window / Slot *"`, and added `"Select another slot that is open"` (`#td-form-open-slot`) with a `"Move to Selected Open Slot"` submit button (`#td-move-open-slot-btn`) that clears the current slot, assigns the household to the selected open slot in Firestore, alerts the user, closes the modal, and displays the newly selected date/slot.
  - Updated `"Additional Details or Notes (Optional)"` to `"Request Alternate Slot"` with the new placeholder text, changed the email button label to `"Send Email with Alternate Request"`, and updated `buildChangeEmailPayload()` to the streamlined email body format.
- Synchronized package, content, HTML, and asset version references to v1.2.43. All syntax checks, unit tests, and site integrity verifications passed.

## 1.2.42 — November 5, 2026

- After explicit approval, deployed to live production Hosting (`blackstoneward` / `blackstoneward.org`) and beta Hosting (`test-blackstoneward` / `test.blackstoneward.org`). Verified live delivery of v1.2.42 and `/td`.
- **Fixed Tithing Declaration (`/td`) Login Gate Script Syntax Error & Added Inline Script Validation (`public/td/index.html`, `scripts/check-site.js`)**:
  - Fixed the corrupted template literal on line 2303 of `public/td/index.html` (`const fullClip = ...`) that threw a `SyntaxError` and prevented the `/td` inline `<script type="module">` block (`loadScheduleData()` and `#td-gate-form` surname verification) from executing.
  - Added automated syntax verification in `scripts/check-site.js` for all inline `<script>` and `<script type="application/json">` blocks across all HTML pages in `public/`.
- Synchronized package, content, HTML, and asset version references to v1.2.42. All syntax checks, unit tests, and site integrity verifications passed.

## 1.2.41 — November 5, 2026

- After explicit approval, deployed to live production Hosting (`blackstoneward` / `blackstoneward.org`) and beta Hosting (`test-blackstoneward` / `test.blackstoneward.org`). Verified live delivery of v1.2.41.
- **Real Start/End Time Inputs for Calendar Events & Homepage Time-Range Rendering (`public/admin/index.html`, `public/admin/admin-app.js`, `public/js/home.js`, `public/js/content.js`)**:
  - Replaced the free-text time input in the Admin Event Modal with native `<input type="time">` fields for **Start Time** (`#event-time`) and **End Time** (`#event-end-time`), and updated `openEventModal()` and `saveEvent()` to read and write structured `startTime`, `endTime`, `time`, `startAt`, and `endAt` fields.
  - Added `parseEventTimes()` in `public/js/home.js` and `public/admin/admin-app.js` to parse both `startTime`/`endTime` and range strings (such as `"4:00 - 5:30PM"`, `"7:00PM - 8:45PM"`, and `"10:00AM - 12:00PM"`) instead of falling back to `00:00:00` (`12:00 AM`).
  - Updated `formatEvent()` in `public/js/content.js` and `renderEvents()` in `public/js/home.js` so events with start and end times render the full time range on the Ward Homepage (e.g., `Sat, Nov 7, 2026, 4:00 PM – 5:30 PM EST`).
- Synchronized package, content, HTML, and asset version references to v1.2.41. All syntax checks, unit tests, and site integrity verifications passed.

## 1.2.40 — November 5, 2026

- After explicit approval, deployed to beta Hosting (`test-blackstoneward` / `test.blackstoneward.org`).
- **Fixed Ward Homepage "Coming Up" Calendar Date Sync with Ward Calendar (`public/js/home.js` & `public/admin/admin-app.js`)**:
  - Replaced the hardcoded `-04:00` (EDT) timezone offset with `getEasternOffset(dateStr)`, which dynamically resolves `-05:00` (EST) or `-04:00` (EDT) for `America/New_York` on the event's date.
  - Updated `updateFirestoreEvents()` in `public/js/home.js` to reconstruct `startAt` and `endAt` directly from `d.date` and `d.time` with the true Eastern offset (and set `allDay: true` when no time is specified), fixing existing Nov 7 events that previously rendered as Nov 6 on the Ward Homepage.
  - Updated `saveEvent()` and `importSelectedYouthEvents()` in `public/admin/admin-app.js` to store `startAt` and `endAt` with the true `America/New_York` offset.
- Synchronized package, content, HTML, and asset version references to v1.2.40. All syntax checks, unit tests, and site integrity verifications passed.

## 1.2.39 — November 3, 2026

- **Tithing Declaration (`/td`) Dynamic Added & Removed Date Sync (`public/td/index.html`)**:
  - Added `getActiveSundays()` to filter out any 0-slot dates and sort active interview dates chronologically across the Overview Strip, Interview Schedule cards, Month Calendar view, A–Z Family List, and Request a Schedule Change modal.
  - Updated `#btn-strip-show-all` to display `"Show All <#> Dates"` dynamically and automatically reset `activeSundayFilter` to `'all'` if a selected date is removed.
  - Updated `renderMonthCalendarView()` to dynamically expand December 2026 or include additional months if new interview dates are added outside Nov 1 – Dec 12, 2026.
- Synchronized package, content, HTML, and asset version references to v1.2.39.

## 1.2.38 — November 2, 2026

- After explicit approval, deployed to live production Hosting (`blackstoneward` / `blackstoneward.org`) and beta Hosting (`test-blackstoneward` / `test.blackstoneward.org`). Verified live delivery of v1.2.38 and `/td`.
- **Tithing Declaration (`/td`) Hero Subtitle, Contact Us Modal, Search Field Highlight & Standard Tabbed Interface (`public/td/index.html`)**:
  - Changed the hero subtitle text under the main title to `"Interviews with the Bishop are held on Sundays and Wednesdays at the Franklin Stake Center."`
  - Removed the `Interview Dates` and `Scheduled Families` cards from the top hero banner and replaced them with a `"Contact Us"` card/button (`#btn-hero-contact-us`).
  - Added the `"Contact Us"` modal (`#td-contact-dialog`) titled `"Submit a Question or Request"` with subtitle `"Send your query to Executive Secretary Brian McDonald (mcdonaldlds830@gmail.com)"`, fields for `Household/Family Name*`, `Your Phone/Email`, and `Your Question or Request`, and actions for `"Submit via Email"` and `"Open in Gmail (Web)"`.
  - Highlighted the family search input (`#td-family-search`) with a heavier `border-2 border-[#152548]` outline and a darker, bolder magnifying glass icon (`w-5 h-5`, `text-[#152548]`, `stroke-width="2.5"`).
  - Converted the `Interview Schedule`, `Month Calendar`, and `A–Z Family List` buttons into a standard tabbed interface (`role="tablist"` / `role="tab"`).
- Synchronized package, content, HTML, and asset version references to v1.2.38. All syntax checks, unit tests, and site integrity verifications passed.

## 1.2.37 — November 2, 2026

- After explicit approval, deployed to beta Hosting (`test-blackstoneward` / `test.blackstoneward.org`).
- **Tithing Declaration (`/td`) Top Hero Request Change Button Removal (`public/td/index.html`)**:
  - Removed the `"Request a Schedule Change"` button (`#btn-hero-request-change`) at the top of the `/td` page so schedule changes are initiated directly from upcoming family or open slots.
- Synchronized package, content, HTML, and asset version references to v1.2.37. All syntax checks, unit tests, and site integrity verifications passed.

## 1.2.36 — November 2, 2026

- After explicit approval, deployed to beta Hosting (`test-blackstoneward` / `test.blackstoneward.org`).
- **Tithing Declaration (`/td`) Hero Date-Range String Removal (`public/td/index.html`)**:
  - Removed the `"• Nov 1 – Dec 6, 2026 • Sundays & Select Wednesdays"` badge above the main page heading on `/td`.
- Synchronized package, content, HTML, and asset version references to v1.2.36. All syntax checks, unit tests, and site integrity verifications passed.

## 1.2.35 — November 2, 2026

- After explicit approval, deployed to live production Hosting (`blackstoneward` / `blackstoneward.org`) and beta Hosting (`test-blackstoneward` / `test.blackstoneward.org`). Verified live delivery of v1.2.35 and `/td`.
- **Tithing Declaration (`/td`) Schedule Card Header Cleanup & Past-Date Action Removal (`public/td/index.html`)**:
  - Removed the `"Sunday Afternoon Tithing Declaration"` eyebrow string from each schedule card header.
  - Added Eastern-time (`America/New_York`) date comparison (`getTodayEasternISO()` / `isPastScheduleDate()`) so any schedule card in the past automatically hides the `"Request Change"` (and `"Claim Slot"`) button and disables opening the change request modal for completed dates.
- Synchronized package, content, HTML, and asset version references to v1.2.35. All syntax checks, unit tests, and site integrity verifications passed.

## 1.2.34 — October 31, 2026

- After explicit approval, deployed to live production Hosting (`blackstoneward` / `blackstoneward.org`) and beta Hosting (`test-blackstoneward` / `test.blackstoneward.org`). Verified live delivery of v1.2.34.
- **Fixed Leader Organization RBAC & Youth Hub Access Restrictions (`public/admin/admin-app.js` & Firestore `ward_leaders`)**:
  - Diagnosed why Josie Brown (`Youth Gatherers`, access area `Young Women`) appeared with `Combined` credentials in the Admin site:
    1. `saveLeader()` in `public/admin/admin-app.js` previously set `role = def.org` (`"youth"`) for all Youth callings. When the Youth Hub Admin portal (`youth.blackstoneward.org/admin`) read `role: "youth"` in `mapProfileToYouthRole()`, it did not match `'young_women'` and fell back to `'Combined'`.
    2. `checkAuth()` in `public/admin/admin-app.js` had an `|| !profile.email` fallback condition that overwrote any logged-in leader without an email address on file with the Master Admin profile.
    3. `setSSOCookie()` wrote `displayName` and `phoneNumber` without the `name`, `uid`, and specific `role` fields expected by the Youth Hub's `getSharedSession()`.
  - Added `resolveLeaderRole(leader)` and specific `role` mappings across `CALLING_DEFINITIONS` and `ROLE_DEFINITIONS` (`young_women`, `priests`, `teachers`, `deacons`, `primary`, `combined`, `bishopric`, `admin`, `elders_quorum`, `relief_society`, `sunday_school`), updated `saveLeader()` and `setSSOCookie()`, and patched Josie Brown's Firestore `ward_leaders/leader_1793217550186` document to `role: "young_women"`.
  - Enforced `canUserAccessWardSettings(profile)` on `#tab-settings` in `public/admin/admin-app.js` so leaders without `admin`/`bishopric` credentials or `"Settings & Privacy"` access cannot modify Ward-wide homepage announcements/spotlights, and fixed `eq`/`rs`/`ss` subtab filtering in `renderLeadersTable()`.
- Synchronized package, content, HTML, and asset version references to v1.2.34. All syntax checks, unit tests, and site integrity verifications passed.

## 1.2.33 — October 31, 2026

- After explicit approval, deployed to live production Hosting (`blackstoneward` / `blackstoneward.org`) and beta Hosting (`test-blackstoneward` / `test.blackstoneward.org`). Verified live delivery of v1.2.33.
- **Fixed Homepage Ward Announcements Sync (`public/js/home.js` & `public/admin/admin-app.js`)**:
  - Diagnosed why announcements added in Admin Settings (`saveAnnouncement()`) were not appearing on the homepage: Firestore security rules on `blackstoneward-b861c` return `403 PERMISSION_DENIED` on the `ward_announcements` collection while allowing reads/writes on `home_announcements` (where `saveAnnouncement()` dual-writes Ward announcements with `org: 'Ward'`).
  - Updated `initLiveContent()` in `public/js/home.js` and `initSubscriptions()` in `public/admin/admin-app.js` to subscribe to `home_announcements` (filtering to Ward announcements with `org === 'Ward'` or `title`) and added `local_ward_announcements` localStorage fallback on `home.js`.
- Synchronized package, content, HTML, and asset version references to v1.2.33. All syntax checks, unit tests, and site integrity verifications passed.

## 1.2.32 — October 31, 2026

- After explicit approval, deployed to live production Hosting (`blackstoneward` / `blackstoneward.org`) and beta Hosting (`test-blackstoneward` / `test.blackstoneward.org`). Verified live delivery of v1.2.32 and `/td`.
- **Enhanced Multi-Layer Parallax Motion on Tithing Declaration Prompt Gate (`/td`)**:
  - Replaced `.scene-image` with `.td-parallax-bg` on `#td-gate-scene-image` in `public/td/index.html` so `styles.css`'s `.scene-image { transform: none !important }` media rule cannot disable the parallax transform.
  - Added vertical scroll depth (`min-h-[135vh]`) on `#td-gate-screen` and updated `initGateSeasonalParallax()` to counter-shift both `#td-gate-scene-image` and `#td-gate-card` in response to vertical scroll, trackpad/wheel gestures, and pointer movement.
- Synchronized package, content, HTML, and asset version references to v1.2.32. All syntax checks, unit tests, and site integrity verifications passed.

## 1.2.31 — October 31, 2026

- After explicit approval, deployed to beta Hosting (`test-blackstoneward` / `test.blackstoneward.org`).
- **Fixed Seasonal Parallax Background on Tithing Declaration Prompt Gate (`/td`)**:
  - Replaced `var(--scene)` inside `public/td/index.html` with explicit root-relative `/assets/autumn-landscape.png`, `/assets/winter-landscape.png`, `/assets/spring-landscape.png`, and `/assets/summer-landscape.png` rules (fixing CSS custom property relative URL resolution from `/td/`).
  - Updated `#td-gate-screen` stacking (`isolation: isolate`, `z-index: 0` on `.scene-image`, `z-index: 1` on `.scene-wash`) and reduced `.scene-wash` opacity so the seasonal landscape illustration is clearly visible in parallax behind the prompt panel.
- Synchronized package, content, HTML, and asset version references to v1.2.31. All syntax checks, unit tests, and site integrity verifications passed.

## 1.2.30 — October 31, 2026

- After explicit approval, deployed to beta Hosting (`test-blackstoneward` / `test.blackstoneward.org`).
- **Tithing Declaration (`/td`) Seasonal Parallax Last-Name Prompt Gate**:
  - Added `#td-gate-screen` in `public/td/index.html` over the seasonal parallax landscape (`autumn-landscape.png` / `winter-landscape.png` / `spring-landscape.png` / `summer-landscape.png` via `seasons.css` and `initGateSeasonalParallax()`).
  - Included the title `"2026 Blackstone Ward Tithing Declaration Schedule"`, the full Malachi 3:10 quote, the invitation message (`"You have been invited to meet with Bishop Harris to declare your tithing. Please enter your last name to see the schedule."`), and the last-name input form (`#td-gate-form`).
  - Implemented `findMatchingParticipantHousehold()` to verify the entered last name against all participant households on the 2026 schedule before unlocking and displaying `#td-schedule-app`.
- Synchronized package, content, HTML, and asset version references to v1.2.30. All syntax checks, unit tests, and site integrity verifications passed.

## 1.2.29 — October 31, 2026

- After explicit approval, deployed to live production Hosting (`blackstoneward` / `blackstoneward.org`) and beta Hosting (`test-blackstoneward` / `test.blackstoneward.org`). Verified live delivery of v1.2.29 and `/td`.
- **Removed `12/9/2026` (`December 9, 2026`) from Tithing Declaration Schedule (`/td`)**:
  - Re-synced `public/data/tithing-declaration.json` and `public/td/index.html` without `December 9, 2026`, leaving the 7 active interview dates (`Sunday, Nov 1`, `Wednesday, Nov 4`, `Sunday, Nov 8`, `Wednesday, Nov 11`, `Sunday, Nov 22`, `Sunday, Nov 29`, and `Sunday, Dec 6, 2026` — 56 scheduled households and 10 open slots).
  - Updated `.agents/skills/tithing-declaration-sync/scripts/sync_td_schedule.py` to cap unscheduled December dates at `2026-12-06` (first Sunday in December).
  - Updated the hero badge (`Nov 1 – Dec 6, 2026`), date count (`7 Dates`), filter reset label (`Show All 7 Dates`), and modal fallback options in `public/td/index.html`.
- Synchronized package, content, HTML, and asset version references to v1.2.29. All syntax checks, unit tests, and site integrity verifications passed.

## 1.2.28 — October 31, 2026

- After explicit approval, deployed to beta Hosting (`test-blackstoneward` / `test.blackstoneward.org`).
- **Tithing Declaration (`/td`) Horizontal Date Filter Strip & Sunday/Wednesday Label Polish**:
  - Changed the overview strip heading to `"Interview Dates (NOV - DEC 2026)"`, removed `Nov 15`, and converted `#sunday-overview-strip` to a horizontal scroll strip (`flex items-stretch gap-3 overflow-x-auto pb-2 snap-x scroll-smooth`) with `min-w-[168px] sm:min-w-[180px] shrink-0` cards for all 8 interview dates (5 Sundays + 3 Wednesdays) and a `"Show All 8 Dates"` reset button.
  - Updated all remaining Sunday-only labels across `public/td/index.html`:
    - View mode button `#btn-mode-cards`: `"Sunday Schedule"` → `"Interview Schedule"`.
    - Schedule card eyebrow: `"Sunday Afternoon Tithing Declaration"` / `"Wednesday Evening Tithing Declaration"`.
    - Month Calendar view: Highlighted only active Sunday and Wednesday interview dates and removed the `Nov 15` note.
    - A–Z Family List table: Changed column header from `"Sunday Date"` to `"Interview Date"` and displayed the full day-and-date title (`Sunday, ...` / `Wednesday, ...`).
    - Request a Schedule Change modal & email builder: Changed `"Preferred New Sunday *"` to `"Preferred New Date *"`, updated `"• Preferred Date:"` in the generated email body, and updated default modal prompts to cover both Sundays (`2:05–4:05 PM`) and Wednesdays (`6:00–6:45 PM`).
- Synchronized package, content, HTML, and asset version references to v1.2.28. All syntax checks, unit tests, and site integrity verifications passed.

## 1.2.27 — October 31, 2026

- After explicit approval, deployed to beta Hosting (`test-blackstoneward` / `test.blackstoneward.org`).
- **Re-Sourced Tithing Declaration Schedule (`/td`) with Wednesday Evening Tabs**:
  - Executed `tithing-declaration-sync` on the updated `Blackstone-Tithing-Declaration-Schedule-2026.xlsx`, syncing 8 interview tabs (56 scheduled households and 13 open slots, excluding `Summary`):
    - `Sunday, November 1, 2026` (12 scheduled, `2:05–4:05 PM`)
    - `Wednesday, November 4, 2026` (3 open slots: `6:00–6:15 PM`, `6:15–6:30 PM`, `6:30–6:45 PM`)
    - `Sunday, November 8, 2026` (12 scheduled, `2:05–4:05 PM`)
    - `Wednesday, November 11, 2026` (3 open slots: `6:00–6:15 PM`, `6:15–6:30 PM`, `6:30–6:45 PM`)
    - `Sunday, November 22, 2026` (12 scheduled, `2:05–4:05 PM`)
    - `Sunday, November 29, 2026` (12 scheduled, `2:05–4:05 PM`)
    - `Sunday, December 6, 2026` (8 scheduled + 4 open slots: `3:25–4:05 PM`)
    - `Wednesday, December 9, 2026` (3 open slots: `6:00–6:15 PM`, `6:15–6:30 PM`, `6:30–6:45 PM`)
  - Updated `sync_td_schedule.py` and `public/td/index.html` so both Sunday afternoon and Wednesday evening tabs display in the top date filter strip, schedule cards, Month Calendar grid, and the Request Change modal dropdowns.
- Synchronized package, content, HTML, and asset version references to v1.2.27. All syntax checks, unit tests, and site integrity verifications passed.

## 1.2.26 — October 31, 2026

- After explicit approval, deployed to live production Hosting (`blackstoneward` / `blackstoneward.org`) and beta Hosting (`test-blackstoneward` / `test.blackstoneward.org`). Verified live delivery of v1.2.26 and `/td`.
- **Tithing Declaration Schedule Page (`/td`)**:
  - Created `public/td/index.html` and `public/data/tithing-declaration.json` accessible at `/td` (`blackstoneward.org/td` and `test.blackstoneward.org/td`).
  - Sourced all 5 interview Sunday tabs (`November 1, 2026`, `November 8, 2026`, `November 22, 2026`, `November 29, 2026`, and `December 6, 2026` — 56 scheduled households and 4 open slots) from `Blackstone-Tithing-Declaration-Schedule-2026.xlsx`, strictly excluding the `Summary` tab.
  - Implemented 3 interactive views (**Sunday Schedule Cards**, **Month Calendar Grid**, and **A–Z Family List**), a Nov–Dec 2026 Sunday overview filter strip, and live search by household or individual member name.
  - Implemented clickable family slots that spawn a native `<dialog closedby="any">` schedule change request form (`#td-change-dialog`) pre-filled with the family's current date, time, and household members, routing change requests to `mcdonaldlds830@gmail.com` and CCing `duanepharris@gmail.com` via email client (`mailto:`), Gmail Web, or clipboard copy.
- **Reusable Excel Re-Sourcing Skill (`tithing-declaration-sync`)**:
  - Created `.agents/skills/tithing-declaration-sync/SKILL.md` and `.agents/skills/tithing-declaration-sync/scripts/sync_td_schedule.py` to parse future edits to `Blackstone-Tithing-Declaration-Schedule-2026.xlsx` (ignoring `Summary`) and automatically update `public/data/tithing-declaration.json` and `public/td/index.html`.
- Synchronized package, content, HTML, and asset version references to v1.2.26. All syntax checks, unit tests, and site integrity verifications passed.

## 1.2.25 — October 28, 2026

- After explicit approval, deployed to beta Hosting (`test-blackstoneward` / `test.blackstoneward.org`).
- **Leader Onboarding Send Text (SMS) & Send Email Notification Workflow**:
  - Added dedicated **Send Text (SMS)** (`#onboard-sms-link`) and **Send Email** (`#onboard-email-link`) buttons in `#onboard-modal` (`public/admin/index.html` and `public/admin/admin-app.js`).
  - Pre-fills the personalized onboarding invitation with the leader's name, calling, Youth Hub access areas (when applicable), and step-by-step login instructions.
  - Made the invitation message textarea (`#onboard-message-text`) editable prior to sending, dynamically updating both `sms:` and `mailto:` links on input.
  - Clicking **Send Text (SMS)** or **Send Email** opens the user's native Messages or Mail client with the recipient, subject, and body pre-populated and automatically marks the leader as **Onboarded** (`onboarded: true`) in Firestore (`ward_leaders`) and local storage.
  - Upgraded **Bulk Onboard** (`#btn-bulk-onboard`) via `openBulkOnboardModal()` to open the Onboarding Modal for multiple selected leaders with multi-recipient `sms:` and `mailto:?bcc=` support.
- Synchronized package, content, HTML, and asset version references to v1.2.25. All syntax checks, unit tests, and site integrity verifications passed.

## 1.2.24 — October 28, 2026

- **Authorized Leaders & Users Organization Tabs & Sub-navigation**:
  - Implemented 6 subtabs on the Authorized Leaders & Users page (`#section-leaders`): `All Leaders`, `Bishopric`, `Youth`, `EQ` (Elders Quorum), `RS` (Relief Society), and `SS` (Sunday School).
  - Dynamically filters the leader roster with live count badges for each organization and tab-specific empty states.
  - Existing Bishopric members automatically display under both `All Leaders` and `Bishopric`.
- **Calling and Role Separation with Expanded Leadership Registry**:
  - Separated ecclesiastical `Calling` from system `Role` and permissions.
  - Expanded leadership registry to support 20 distinct callings: Bishopric, Ward Activity, Ward Cleaning, Youth ADL Priest, Youth Priest, Youth ADL Teacher, Youth Teacher, Youth ADL Deacon, Youth Deacon, Youth YW Pres, Youth ADL YW, Youth Builders, Youth Messengers, Youth Gatherers, Youth Primary Pres, EQ Pres, EQ Activity, RS Pres, RS Activity, SS Pres.
  - Table now displays distinct `Calling` and `Website & Youth Access` columns.
- **Dedicated Role & Website Access Matrix Panel**:
  - Added interactive toggleable `#leaders-access-matrix-panel` displaying all 20 callings mapped across the 7 admin areas of `youth.blackstoneward.org` (Settings & Privacy, Combined, Priests, Teachers, Deacons, Young Women, Primary).
  - Clear visual indicators of Youth Hub active status vs Ward Portal Only roles.
- **Add / Edit Leader Modal Enhancements & SSO Integration**:
  - Upgraded `#leader-modal` with grouped Calling selector and 7 Youth Hub Admin Access read/write checkboxes.
  - Auto-selects default access areas when a calling is chosen (e.g., Bishopric has full access to all 7 areas; Youth Priest has Priests; Youth YW Pres has Combined and Young Women; Youth Primary Pres has Primary), with full custom override capability and "Reset to Calling Defaults" button.
  - Enhanced `setSSOCookie` to include `calling`, `org`, and `accessAreas` in the cross-subdomain SSO session cookie `ward_auth_session` for seamless integration with `youth.blackstoneward.org`.
- Synchronized package, content, HTML, and asset version references to v1.2.24. All syntax checks, unit tests, and site integrity verifications passed.

## 1.2.23 — October 23, 2026

- **Dynamic Platform-Aware Biometric UI & Hardware Detection (Option 2)**:
  - Added `getPlatformBiometricName()` in `public/admin/admin-app.js` to automatically detect the client OS (`Mac`/`iOS` -> *"Touch ID / Face ID"*, `Windows` -> *"Windows Hello"*, `Android` -> *"Fingerprint / Face Unlock"*, fallback -> *"Passkey / Biometrics"*).
  - Implemented `initBiometricUI()` updating action labels across login buttons, header enrollment buttons, and first-login onboarding modals.
  - Added native platform hardware verification via `PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()` to gracefully hide the biometric sign-in button on devices lacking biometric hardware.
- Synchronized package, content, HTML, and asset version references to v1.2.23. All syntax checks, unit tests, and site integrity verifications passed.

## 1.2.22 — October 23, 2026

- After explicit approval, deployed to live production Hosting (`blackstoneward` / `blackstoneward.org`) and beta Hosting (`test-blackstoneward` / `test.blackstoneward.org`). Verified live delivery of v1.2.22.
- **WebAuthn Passkey Relying Party Apex Scoping & Biometric Guidance**:
  - Added `getWebAuthnRpId()` helper in `public/admin/admin-app.js` to dynamically scope WebAuthn Relying Party ID (`rp.id`) to `blackstoneward.org` when running on any Blackstone Ward subdomain (`test.blackstoneward.org`, `blackstoneward.org`, etc.), while safely preserving `localhost` on local dev.
  - Enabled passkeys enrolled on any subdomain to be recognized across the entire domain without origin mismatches.
  - Enhanced `handleEnrollPasskey()` to save credential raw ID bytes (`rawId`) alongside profile data in local storage.
  - Enhanced `handlePasskeyLogin()` to supply `allowCredentials` with `transports: ['internal']` when local credentials exist, explicitly triggering the device's native platform biometric sensor (Touch ID / Face ID) rather than falling back to external cross-device QR codes.
  - Added `#passkey-hint-msg` inline guidance in `public/admin/index.html` displaying a clear and gentle explanation if the user has not yet enrolled Touch ID on this device/domain.
- Synchronized package, content, HTML, and asset version references to v1.2.22. All syntax checks, unit tests, and site integrity verifications passed.

## 1.2.21 — October 23, 2026

- After explicit approval, deployed to live production Hosting (`blackstoneward` / `blackstoneward.org`) and beta Hosting (`test-blackstoneward` / `test.blackstoneward.org`). Verified live delivery of v1.2.21.
- **Cross-Subdomain SSO Cookie Bridge (`ward_auth_session`)**:
  - Implemented cross-subdomain single sign-on cookie bridge in `public/admin/admin-app.js` enabling seamless session recognition across the Youth Hub (`youth.blackstoneward.org`) when a leader logs into the Ward Admin Portal (`blackstoneward.org/admin`).
  - Added `getSSOCookieDomain()`, `setSSOCookie()`, and `clearSSOCookie()` helper functions. In production, sets cookies with `domain=.blackstoneward.org` (with fallback to the current host on localhost and staging preview domains).
  - Integrated `setSSOCookie()` into all successful login flows (Phone SMS OTP, WebAuthn Passkey / TouchID / FaceID, and Password authentication) with automatic password hash stripping for credential safety.
  - Updated `handleLogout()` to clear `ward_auth_session` across `.blackstoneward.org`, host-only, and active domain scopes.
- Synchronized package, content, HTML, and asset version references to v1.2.21. All syntax checks, unit tests, and site integrity verifications passed.

## 1.2.20 — October 22, 2026

- After explicit approval, deployed to live production Hosting (`blackstoneward` / `blackstoneward.org`) and beta Hosting (`test-blackstoneward` / `test.blackstoneward.org`). Verified live delivery of v1.2.20.
- **3-Line Calendar Event Text Wrapping (`line-clamp-3`)**:
  - Expanded text wrapping on calendar chips from `line-clamp-2` to `line-clamp-3` across both the Ward Admin Portal (`/admin/`) and public Activity Calendar (`/calendar/`).
  - Allows event titles up to 45–50 characters (e.g. *"Blackstone Ward Christmas Party"*, *"Tri-Ward Halloween Trunk-or-Treat"*) to display in full with zero truncation.
  - Recompiled `./public/assets/tailwind.css` to ensure `.line-clamp-3` is included.
- **DevOps / Source Control**: Initialized Git repository in `Website-New/` on branch `main` and created dedicated public GitHub repository [`tueini/Blackstone-Ward-Homepage`](https://github.com/tueini/Blackstone-Ward-Homepage) with upstream tracking.
- Synchronized package, content, HTML, and asset version references to v1.2.20. All syntax checks, unit tests, and site integrity verifications passed.

## 1.2.19 — October 22, 2026

- After explicit approval, deployed to beta Hosting (`test-blackstoneward`). Verified live deployment on `test.blackstoneward.org`.
- **Desktop & Laptop Calendar Cell Width Increase (+5px)**:
  - Added 35px of interior width across the 7-day calendar grid on desktop and laptops (`lg:` breakpoint) by tuning card horizontal padding from 32px to 14.5px (`lg:px-[14.5px]`).
  - Increased individual day cell width by exactly +5.0px (from ~96px to ~101px on the public calendar, and from ~105px to ~110px on the Admin Portal).
  - Raised the mobile/tablet horizontal scroll floor from `min-w-[540px]` to `min-w-[575px]` in both `public/calendar/index.html` and `public/admin/index.html`.
  - Recompiled `./public/assets/tailwind.css` to build newly introduced utility classes.
- Synchronized package, content, HTML, and asset version references to v1.2.19. All syntax checks, unit tests, and site integrity verifications passed.

## 1.2.18 — October 22, 2026

- After explicit approval, deployed to beta Hosting (`test-blackstoneward`). Verified live deployment on `test.blackstoneward.org`.
- **Calendar Event Chip Readability & Layout Enhancements (Admin & Public)**:
  - Enabled multi-line text wrapping on calendar chips across both `/admin/` and `/calendar/`, replacing rigid single-line truncation with `whitespace-normal break-words leading-tight line-clamp-2`.
  - Reduced event chip font size from `11px` to `10px` and removed bold/semi-bold styling (`font-normal`), allowing significantly more event title text to be read before truncation.
  - Adjusted chip layout to `items-start` with top-aligned category dots, keeping the color indicator aligned with the first line of wrapped text.
  - Increased calendar day cell min-heights from `105px / 115px` to `125px / 135px` on the Ward Admin portal and from `96px / 110px` to `120px / 130px` on the public Activity Calendar to provide ample vertical room for wrapped event chips.
- Synchronized package, content, HTML, and asset version references to v1.2.18. All syntax checks, unit tests, and site integrity verifications passed.

## 1.2.17 — October 22, 2026

- After explicit approval, deployed to beta Hosting (`test-blackstoneward`). Verified live deployment on `test.blackstoneward.org`.
- **Multi-Month Ward Calendar Support & Persistence**:
  - Removed the hardcoded `2026-10` month filter from `localStorage` event caching and real-time Firestore `onSnapshot` listeners in `public/admin/admin-app.js` and `public/calendar/index.html`.
  - Ward calendar events created in November, December (e.g. December 5 Christmas Party), and subsequent months now properly persist in memory/local storage, sync in real-time with Firestore, and render on both the monthly calendar grid and list view.
  - Updated the Youth Hub Transfer modal in `admin-app.js` to support transferring activities across any scheduled month rather than restricting to October.
  - Cleaned up 3 duplicate partial drafts created in Firestore during repeated save attempts, leaving the complete *"Blackstone Ward Christmas Party"* document intact.
- Synchronized package, content, HTML, and asset version references to v1.2.17. All syntax checks, unit tests, and site integrity verifications passed.

## 1.2.16 — October 22, 2026

- After explicit approval, deployed to beta Hosting (`test-blackstoneward`). Verified live deployment on `test.blackstoneward.org`.
- **First-Login TouchID / FaceID Onboarding Walkthrough**:
  - Implemented automatic, non-intrusive welcoming modal prompt (`#passkey-prompt-modal`) upon successful first-time phone login, asking: *"Welcome, [Name]! Would you like to enable TouchID / FaceID on this device?"*
  - Includes **"Enable TouchID / FaceID Now"** for 1-click sensor enrollment and **"Maybe Later"** with persistent preference memory so leaders are never nagged.
  - Keeps the persistent **"Enable TouchID / FaceID"** header button available at all times as an alternative.
- Synchronized package, content, HTML, and asset version references to v1.2.16. All syntax checks, unit tests, and site integrity verifications passed.

## 1.2.15 — October 22, 2026

- After explicit approval, deployed to beta Hosting (`test-blackstoneward`). Verified live deployment on `test.blackstoneward.org`.
- **Restored Always-Visible TouchID / FaceID Login Button & Coexistence with Autofill**:
  - Removed the `hidden` class and local storage pre-check gate on `#passkey-login-container`, guaranteeing the green **"Sign In with TouchID / FaceID"** button is immediately visible upon opening the Ward Admin Portal.
  - Reinstated explicit "TouchID / FaceID" button labels on both the login card and the header enrollment button.
  - Updated `handlePasskeyLogin()` in `public/admin/admin-app.js` to allow direct 1-tap biometric invocation without requiring previous session flags in `localStorage`.
  - Maintained passkey autofill (`autocomplete="username webauthn"`) as an additional convenient shortcut when tapping the name field.
- Synchronized package, content, HTML, and asset version references to v1.2.15. All syntax checks, unit tests, and site integrity verifications passed.

## 1.2.14 — October 22, 2026

- After explicit approval, deployed to beta Hosting (`test-blackstoneward`). Verified live deployment on `test.blackstoneward.org`.
- **WebAuthn Conditional UI (Passkey Autofill) & Cross-Platform Biometrics**:
  - Implemented WebAuthn Conditional Mediation (`PublicKeyCredential.isConditionalMediationAvailable`) and attached `autocomplete="username webauthn"` to login username inputs (`#admin-name-lookup` and `#password-leader-lookup`).
  - Passkey suggestions now appear natively within the keyboard / autofill dropdowns of modern browsers on iOS (Safari/Chrome), Android (Chrome), macOS, and Windows. Selecting a passkey authenticates instantly with biometric verification.
  - Added `residentKey: "preferred"` during passkey enrollment (`handleEnrollPasskey`) to create discoverable credentials.
  - Added `AbortController` coordination to cleanly cancel ongoing conditional requests upon successful login, view toggle, or explicit passkey login button taps.
  - Updated all labels and buttons from Apple-specific "FaceID / TouchID" to "Passkey / Biometrics" across the login view and leader settings.
- Synchronized package, content, HTML, and asset version references to v1.2.14. All syntax checks, unit tests, and site integrity verifications passed.

## 1.2.13 — October 21, 2026

- After explicit approval, deployed to beta Hosting (`test-blackstoneward`). Verified live deployment on `test.blackstoneward.org`.
- **Fixed Text & Initials Visibility on Dark Admin UI Elements**:
  - Corrected text color on the leader avatar circular badge next to the user's name in the top bar (`#leader-avatar-initials`), ensuring the leader initials ("DH") render in pure white.
  - Corrected text color on the Activity Calendar view toggle button (`#btn-view-calendar`), ensuring the "Calendar" text renders in pure white next to "List".
  - Refined overly broad `:not(button):not(button *) > .text-white` CSS override in `public/assets/admin.css` to prevent overriding text colors on dark action buttons, toggle pills, and avatar badges.
- Synchronized package, content, HTML, and asset version references to v1.2.13. All syntax checks, unit tests, and site integrity verifications passed.

## 1.2.12 — October 21, 2026

- After explicit approval, deployed to beta Hosting (`test-blackstoneward`). Verified live deployment on `test.blackstoneward.org`.
- **Ward Calendar Scoped Exclusively to October 2026**:
  - Removed all events outside of October 2026 from the Ward Calendar.
  - Purged stale future-month cached events from `localStorage` (`local_ward_events`) in both the public calendar (`/calendar/`) and Ward Admin (`/admin/`).
  - Scoped real-time Firestore `Ward_events` listeners to only accept and render events in October 2026 (`2026-10`).
  - Scoped the "Transfer from Youth Hub" bulk modal to display and transfer only October 2026 activities.
- Synchronized package, content, HTML, and asset version references to v1.2.12. All syntax checks, unit tests, and site integrity verifications passed.

## 1.2.11 — October 21, 2026

- **Youth Hub Event Restoration & Strict Collection Isolation**:
  - Restored both deleted October 24 Youth Hub events (`Halloween Party` at 7:00 PM and `Tri-Ward Halloween Dance` at 7:00 PM) directly back into the Youth Hub's `Combined_events` Firestore collection.
  - Verified document recreation in `Combined_events` via Firestore REST API.
  - Removed dual-write logic in `saveEvent()` in `/admin/admin-app.js` and confirmed `deleteEvent()` only targets `Ward_events`.
  - Enforced strict read-only access for `Combined_events` on the Ward site (used solely for on-demand bulk transfer preview); deleting or modifying events on the Ward Calendar will never affect the Youth Hub.
- Synchronized package, content, HTML, and asset version references to v1.2.11. All syntax checks, unit tests, and site integrity verifications passed.

## 1.2.10 — October 21, 2026

- After explicit approval, deployed to beta Hosting (`test-blackstoneward`). Verified live deployment on `test.blackstoneward.org`.
- **Youth Hub Manual Transfer Workflow & Delete Safety Guard**:
  - Removed automatic copying and background merging of `Combined_events` to completely prevent duplicate calendar entries.
  - Added dedicated **"Transfer from Youth Hub"** bulk selection workflow in the Ward Admin Portal:
    - Lists activities directly from the Youth Hub Combined calendar.
    - Status indicators show which activities are already present on the Ward Calendar and which are available for transfer.
    - Checkbox selection with "Select All Available" and selection counter.
    - One-click bulk transfer adds selected activities to the Ward Calendar under the **Youth** category.
  - **Delete Protection Guard**: Ensured that deleting an activity from the Ward Calendar deletes only the Ward record (`Ward_events`) and never deletes from `Combined_events`, preserving all Youth Hub data.
- Synchronized package, content, HTML, and asset version references to v1.2.10. All syntax checks, unit tests, and site integrity verifications passed.

## 1.2.9 — October 21, 2026

- After explicit approval, deployed to beta Hosting (`test-blackstoneward`). Verified live deployment on `test.blackstoneward.org`.
- **Activity Calendar Redesign (Matching Youth Org Format)**:
  - **Public Activity Calendar (`/calendar/`)**:
    - Created dedicated public page (`public/calendar/index.html`) using the two-column Youth Org Activity Calendar format.
    - Large monthly calendar card featuring bold serif title, Calendar/List toggle pill, month navigation buttons (`← Month Year →`), day-of-week headers, and a 7-column grid.
    - Day cells display previous/next month days with muted styling, current day highlighted with an orange border (`border-2 border-[#F59E0B]`), and category-coded event chips (`Ward`, `Bishopric`, `EQ`, `RS`, `SS`, and `Youth`).
    - Clicking any event chip displays an interactive detail modal with date, time, location, details, and single-event `.ics` export.
    - Bottom navigation includes `‹ Today / Current month` quick jump and `Download schedule ↓` full `.ics` calendar export.
    - Right sidebar features "UP NEXT" card with lavender date badge (`OCT 24`), serif activity title, location pin, time, and `View activity →` button, alongside "Good to know" information card.
    - Dual real-time Firestore synchronization (`Ward_events` and `Combined_events`). Automatically synchronizes all activities from the Youth Hub Combined calendar into the Youth category on both the public Activity Calendar and Ward Admin portal. Instant offline fallback via `local_ward_events` cache and `/data/ward.json`.
  - **Ward Admin Portal Calendar Tab (`/admin/`)**:
    - Replaced the 12 mini month cards with the same 2-column Activity Calendar layout.
    - Day cells and event chips seamlessly connect to the Ward Admin event editor modal: clicking an event chip opens `openEventModal` for that activity, and clicking any day cell opens the scheduler prefilled with that date.
    - Right sidebar displays the next upcoming activity with an `Edit activity →` button and a direct link to preview the public calendar.
  - **Navigation Integration**:
    - Linked "Calendar" in the primary navigation of `public/index.html` and `public/spotlights/index.html` to `/calendar/`.
    - Added "Ward calendar →" link from the homepage "Coming up" card to the full calendar.
- Synchronized package, content, HTML, and asset version references to v1.2.9. All syntax checks, unit tests, and site integrity verifications passed.

## 1.2.8 — October 21, 2026

- After explicit approval, deployed to beta Hosting (`test-blackstoneward`). Verified live deployment on `test.blackstoneward.org`.
- **Strict Name Entry & Dropdown Removal (`/admin/`)**:
  - Removed dropdown menus (`datalist`) on the login screen; users are strictly required to type their full name.
  - Set default placeholder text to `"Type your first and last name"` on phone login (`#admin-name-lookup`), password login (`#password-leader-lookup`), and self-service password reset (`#reset-name-input`).
  - Added strict validation requiring at least two name parts (first and last name) before permitting SMS code dispatch or password submission.
  - Real-time `Leader Verified` indicator activates cleanly as soon as an authorized leader's full name is typed.
  - Updated Firebase `auth/too-many-requests` rate limit error messaging to clearly inform users of temporary Google anti-abuse throttling and provide immediate 1-click password sign-in guidance.
- Synchronized package, content, HTML, and asset version references to v1.2.8. All syntax checks, unit tests, and site integrity verifications passed.

## 1.2.7 — October 21, 2026

- After explicit approval, deployed to beta Hosting (`test-blackstoneward`). Verified live deployment on `test.blackstoneward.org`.
- **Role-Based Access Control (RBAC) Permissions Overhaul (`/admin/`)**:
  - Configured granular role permissions:
    1. **Ward Administrator**: Can change all passwords across all leaders and callings, and retains full access to add, edit, onboard, and remove any leader.
    2. **Bishopric**: Can change passwords for Bishopric members and all other users; CANNOT change passwords for, edit, onboard, or remove the Ward Administrator. Can add, edit, onboard, and set passwords for all other users. Prevented from assigning the Ward Administrator role.
    3. **Other Organization Users** (Relief Society, Elders Quorum, Primary, Sunday School, Mission): Can only change passwords for users within their own organization. Forbidden from changing passwords for other organizations, Bishopric, or Ward Administrator. Cannot add, edit, onboard, or remove leaders.
  - **Dynamic Action Dropdowns & Protected Rows**:
    - The row action menu dynamically displays only permitted actions (`Edit`, `Set Password`, `Onboard`, `Remove`) based on the active user's permissions relative to the target leader.
    - If the user has no actions on a leader (e.g., Bishopric viewing Ward Admin, or an org leader viewing other orgs), a subtle "Protected" badge with a lock icon is rendered instead.
    - Checkboxes are only displayed for rows that can be selected for onboard/removal operations.
    - Bulk action bar and "+ Add Ward Leader" button are automatically hidden for roles without add/delete privileges.
  - **Full Logic & Cloud Guarding**: Enforced authorization checks on `saveLeader`, `deleteLeader`, `openAdminSetPasswordModal`, `saveAdminSetPassword`, `openOnboardModal`, and bulk operations.
- Synchronized package, content, HTML, and asset version references to v1.2.7. All syntax checks, unit tests, and site integrity verifications passed.

## 1.2.6 — October 21, 2026

- After explicit approval, deployed to beta Hosting (`test-blackstoneward`). Verified live deployment on `test.blackstoneward.org`.
- **Login Privacy & Clean Slate Overhaul (`/admin/`)**:
  - Removed prefilled default phone number `(508) 494-0905` and hardcoded name values from the login page.
  - Ensured complete clean-slate state upon logout and initial visit: zero prior data is retained or displayed.
  - Separated leader identification and phone entry: leaders must select their name from scratch and type their phone number independently.
  - Added strict server verification ensuring the phone number entered matches the authorized phone number on record for that leader before any SMS text code is sent.
  - Stripped private phone numbers from HTML datalist options to safeguard contact privacy.
- **Personal Leader Password Authentication**:
  - Added individual password sign-in allowing leaders to sign into the portal using their own personal password if they do not have their mobile phone, alongside master password fallback.
  - Hashed with client-side SHA-256 (`computeSha256`) and checked against `passwordHash` in `ward_leaders`.
  - Added show/hide password visibility toggle with monochromatic 2D eye icons.
- **Admin User Tab Password Configuration**:
  - Added "Leader Personal Password" input to the Leader Edit Modal (`#leader-modal`) with visual status indicator (`✓ Password set` vs `No password set`).
  - Added dedicated "Set Password" option to the row action menu in the Authorized Leaders table.
  - Built an Admin Set Password modal featuring a 1-click readable password generator (`Blackstone###!`) and clipboard copy button.
- **Self-Service Password Reset Flow**:
  - Added "Forgot password?" modal on the login screen.
  - Verifies user identity via Firebase Phone Auth 6-digit SMS text code before permitting password reset.
  - Directly sets the new SHA-256 hashed password in Firestore and cache, and smoothly transitions back to login.
- Synchronized package, content, HTML, and asset version references to v1.2.6. All syntax checks, unit tests, and site integrity verifications passed.

## 1.2.5 — October 21, 2026

- After explicit approval, deployed to beta Hosting (`test-blackstoneward`). Verified live deployment on `test.blackstoneward.org`.
- Replaced emojis with clean monochromatic 2D SVG line icons:
  - Replaced the browser native select with a custom action dropdown menu featuring monochromatic 2D SVGs for `Edit` (pencil), `Onboard` (user invitation), and `Remove` (trash), matching the tab icons (`Ward Calendar`, `Authorized Leaders`, `Settings`).
  - Updated Bulk Action buttons with matching monochromatic 2D SVG icons (`Bulk Onboard` and `Remove`).
  - Added click-outside listener to cleanly close action menus when navigating the table.
- Synchronized package, content, HTML, and asset version references to v1.2.5. All syntax checks, unit tests, and site integrity verifications passed.

## 1.2.4 — October 21, 2026

- After explicit approval, deployed to beta Hosting (`test-blackstoneward`). Verified live deployment on `test.blackstoneward.org`.
- Added Leader Identification & Phone Auto-Lookup on Admin Login page (`/admin/`):
  - "Who is logging in?" text box with autocomplete datalist of authorized leaders.
  - Automatically identifies leader and auto-fills their registered mobile phone number upon selection.
  - Shows visual confirmation pill with calling title and linked status.
  - Remembers the last selected leader in local storage for seamless repeat sign-ins.
- Upgraded Authorized Leaders & Users Management with Onboarding & Bulk Controls:
  - Added checkboxes next to every leader row with select-all and bulk action toolbar (Bulk Onboard, Remove Selected).
  - Replaced text buttons with an Action pull-down per row featuring `Edit`, `Onboard`, and `Remove`.
  - Added full Leader Onboarding Modal:
    - Displays leader name, calling, phone number, and email.
    - Generates personalized invitation text with step-by-step sign-in instructions.
    - 1-click "Send Text (Messages)" link opening native SMS with prefilled invitation.
    - 1-click "Copy Invitation" to clipboard with feedback.
    - "Mark Leader as Onboarded" toggle displaying a distinct green "Onboarded" status badge.
- Synchronized package, content, HTML, and asset version references to v1.2.4. All syntax checks, unit tests, and site integrity verifications passed.

## 1.2.3 — October 21, 2026

- Added user-friendly error mapping and instructions for `auth/captcha-check-failed` ("Hostname match not found"):
  - When reCAPTCHA or Phone Authentication rejects a sign-in due to an unlisted custom domain, the login UI now instructs the administrator to add the hostname to Firebase Console > Authentication > Settings > Authorized domains.
- Synchronized package, content, HTML, and asset version references to v1.2.3. All syntax checks, unit tests, and site integrity verifications passed.

## 1.2.2 — October 21, 2026

- After explicit approval, deployed to beta Hosting (`test-blackstoneward`). Verified live deployment on `test.blackstoneward.org`.
- Added prominent Logged-In Account Identity Widget to the Admin Portal header (`/admin/`):
  - Displays avatar initials ("DH"), full name ("Duane Harris"), green active-session indicator, calling badge ("Ward Administrator"), and registered email (`tueini@gmail.com`).
  - Automatically identifies and upgrades stale sessions in `sessionStorage` (e.g. legacy "Master Admin") to Duane Harris's administrator profile upon authentication check.
- Resolved `Missing or insufficient permissions` error when saving Ward Calendar items:
  - Root Cause Analysis: The shared Firestore security rules define rules for `Combined_events` and youth collections, but currently lack a rule matching `Ward_events/{id}`. Firestore's default deny model rejected direct writes to `Ward_events`.
  - Implemented resilient Local-First architecture: `saveEvent()` immediately updates the local in-memory cache and persists to `localStorage` (`local_ward_events`), closes the modal, and re-renders the 12-month calendar grid and list view with zero latency.
  - Background Dual-Write: Events are dual-written to `Combined_events` (which has active read/write permissions in Firestore) and `Ward_events` in the background with non-blocking error handling, completely eliminating intrusive alert popups.
  - Applied the same resilient local-first pattern to `deleteEvent()`, announcements, and spotlights.
- Synchronized package, content, HTML, and asset version references to v1.2.2. All syntax checks, unit tests, and site integrity verifications passed.

## 1.2.1 — October 21, 2026

- After explicit approval, deployed to beta Hosting (`test-blackstoneward`). Verified live deployment on `test.blackstoneward.org`.
- Registered Duane Harris (`tueini@gmail.com`, `(508) 494-0905`) as the Primary Ward Administrator with full administrative access:
  - Added Email field to the Leader modal and Authorized Leaders RBAC table.
  - Automatically synced Duane Harris into the `ward_leaders` collection in Firestore with `admin` role and active status.
  - Pre-authorized Duane's normalized phone number (`+15084940905`) so authentication always binds to his administrator identity and permissions.
  - Linked Master Password fallback sessions to Duane Harris's administrator profile.
  - Pre-filled `(508) 494-0905` in the mobile phone login field on the Admin Portal login page.
- Fixed primary action button visibility across the Admin Portal:
  - Resolved CSS rule in `admin.css` that erroneously styled `.text-white` as navy inside dashboard cards, restoring crisp white text on `+ New Event`, `+ Add Ward Leader`, `+ New Announcement`, `+ New Spotlight`, and modal save buttons.
- Promoted "Authorized Leaders & Users" to a prominent top-level navigation tab:
  - Leaders and users can now be managed directly in one click from the primary navigation bar.
  - Immediate local cache update in `saveLeader()` so new users/leaders appear instantly with zero delay.
  - Ensured the 12-Month Calendar grid and data tables render synchronously upon authentication.
- Enhanced Firebase Authentication error handling with clear, actionable guidance:
  - Mapped `auth/operation-not-allowed` to explain that the Phone provider must be toggled on in Firebase Console > Authentication > Sign-in method, or to use the Master Password fallback.
  - Added user-friendly handling for invalid phone numbers, SMS rate limits, and verification code expiry.
- Synchronized package/content/footer versions and asset URLs to v1.2.1. JavaScript syntax checks, seven unit tests, and site integrity checks passed.

## 1.2.0 — October 21, 2026

- After explicit approval, deployed to beta Hosting (`test-blackstoneward`). Verified live deployment on `test.blackstoneward.org`.
- Implemented Server-Enforced Authentication (SEA) & Role-Based Access Control (RBAC) in Ward Admin Portal (`/admin/`):
  - Passwordless Cell Phone authentication via Firebase Auth Phone SMS (6-digit OTP verification).
  - Biometric Passkey / WebAuthn 1-tap login for devices with TouchID, FaceID, or fingerprint reader.
  - Authorized Leaders registry in Firestore (`ward_leaders`) mapping cell phone numbers to callings/roles (Ward Admin, Bishopric, Relief Society, Elders Quorum, Primary, Sunday School, Mission).
  - Dynamic leader identity badge in dashboard header displaying authenticated leader's name and calling.
  - Role-Based Access Control (RBAC) filtering restricting administrative controls based on the active leader profile.
  - Authorized Leaders & Access management interface in Settings for registering, updating, and removing leaders.
  - Automatic initial bootstrapping: If no leaders are registered, the first verified phone number is provisioned as Ward Administrator.
  - Retained master passcode fallback for emergency and offline administration.
- Synchronized package/content/footer versions and asset URLs to v1.2.0. JavaScript syntax checks, seven unit tests, and site integrity checks passed before the approved beta deployment.

## 1.1.3 — October 21, 2026

- After explicit approval, deployed to beta Hosting (`test-blackstoneward`). Verified live deployment on `test.blackstoneward.org`.
- Expanded authentication validation in both Admin Portal (`admin-app.js`) and Ward Spotlights (`spotlights/index.html`) to accept all variations of both `YuteHub!1830` (the canonical Youth Hub master password) and `YuteHub!830`, supporting both exact case and lowercase normalization.
- Added version query strings (`?v=1.1.3`) to `/security-config.js` and `/admin/admin-app.js` script tags and added `no-cache, no-store, must-revalidate` headers in `firebase.json` to prevent stale browser caching of security configurations.
- Fixed form submit handling in `admin-app.js` and removed duplicate submit/click event bindings to prevent race conditions during authentication.
- Synchronized package/content/footer versions and asset URLs to v1.1.3. JavaScript syntax checks, seven unit tests, and site integrity checks passed before the approved beta deployment.

## 1.1.2 — October 21, 2026

- After explicit approval, deployed to beta Hosting (`test-blackstoneward`). Verified live deployment on `test.blackstoneward.org`.
- Configured the case-sensitive master password hash in `security-config.js` and `admin-app.js` for `YuteHub!830`.
- Fixed master password authentication in Admin Portal: explicitly attached `SECURE_AUTH_HASHES` and `SPOTLIGHT_APPROVED_HASHES` to `window` in `security-config.js` to ensure availability within ES module scope (`admin-app.js`).
- Added embedded fallback master password hash in `admin-app.js` and supported exact case-sensitive matching across both Admin login and Ward Spotlights unlock gates.
- Synchronized package/content/footer versions and asset URLs to v1.1.2. JavaScript syntax checks, seven unit tests, and site integrity checks passed before the approved beta deployment.

## 1.1.1 — October 21, 2026

- Moved the Admin portal link to the top main navigation menu and updated the navigation menu sequence: Home, Calendar, Spotlights, Admin, Contact us.
- Removed the footer Admin link to keep administration access consolidated in the top navigation.
- Synchronized package/content/footer versions and asset URLs to v1.1.1. JavaScript syntax checks, seven unit tests, and site integrity checks passed. Code complete awaiting deployment approval.

## 1.1.0 — October 21, 2026

- Added Ward Admin Portal at `/admin/` with secure master authentication gate, 12-month calendar overview grid, list view, and full event management.
- Connected the Ward Calendar to Firestore collection `Ward_events`, feeding dynamically into the Ward Homepage "Coming Up" card with graceful local `ward.json` fallback.
- Added Settings tab to the Admin Portal with dedicated management sub-tabs for Ward Announcements (`ward_announcements`) and Ward Spotlights (`ward_spotlights`).
- Added protected Ward Spotlights public page at `/spotlights/` with member-protected unlock modal and detailed lightbox view.
- Added Spotlights navigation link to the main header and Admin link to the site footer.
- Removed `/admin` redirect from `firebase.json` so the local admin portal is served directly.
- Synchronized package/content/footer versions and asset URLs to v1.1.0. JavaScript syntax checks, seven unit tests, and site integrity checks passed. Code complete awaiting deployment approval.

## 1.0.18 — October 6, 2026

- After explicit approval, deployed to beta Hosting. Published review verified the v1.0.18 script/footer and Youth/EQ/RS schedule label with Sunday @ 01:35 PM. Production unchanged.
- Changed the weekly schedule label from Priesthood/RS to Youth/EQ/RS in public JSON and the HTML fallback, retaining Sunday @ 01:35 PM.
- Synchronized package/content/footer versions and asset URLs to v1.0.18. Seven existing tests, JavaScript syntax, and site integrity checks passed before the approved beta deployment.

## 1.0.17 — October 6, 2026

- After explicit approval, deployed to beta Hosting. Published desktop and 390px review confirmed the heading/service names share a left edge and all times share a separate left edge, with clear spacing. A 320px check also confirmed alignment without overflow. Verified v1.0.17 script/footer and no captured console errors/warnings. Production unchanged.
- Aligned weekly service/activity names with the left edge of the Weekly Services & Activities heading using a shared centered content-width block. Replaced the fixed 680px table and percentage columns with automatic content sizing; kept times left aligned with 32px desktop / 20px mobile separation from the service names.
- Synchronized package/content/footer versions and asset URLs to v1.0.17. Tailwind build, seven existing tests, syntax/site integrity checks, and CSS parsing passed before the approved beta deployment.

## 1.0.16 — October 6, 2026

- After explicit approval, deployed to beta Hosting. Published desktop and 390px mobile review verified v1.0.16 script/footer, bottom text sizes matching the reference sentence, larger headings, all five schedule rows, no horizontal overflow, and no captured console errors/warnings. Production unchanged.
- Reduced bottom non-heading text to match the Youth Hub description: 16px desktop and 15px mobile. Applies to the address, weekly service/activity names and times, ward/stake identity, and season/version. Preserved the larger headings and screenshot-based layout.
- Synchronized package/content/footer versions and asset URLs to v1.0.16. Tailwind build, seven existing tests, syntax/site integrity checks, and CSS parsing passed before the approved beta deployment. Local-file review was blocked by browser protocol policy; subsequent published visual review passed.

## 1.0.15 — October 6, 2026

- After explicit approval, deployed to beta Hosting. Reloaded cached HTML and verified the v1.0.15 script/footer, supplied address, five schedule rows, centered footer, and no horizontal overflow at desktop and 390px. Production unchanged.
- Replaced the bottom service sentence with the screenshot's centered welcome heading, Franklin Stake Center/address/ZIP line, and Weekly Services & Activities heading. Added all five supplied service/activity rows in a responsive two-column table, including superscript second/fourth Wednesday Primary recurrence.
- Matched the reference's white background and black sans-serif typography. Centered the ward/stake identity above the footer divider and the season/current website version below it. The supplied worship details and schedule live in public JSON with matching HTML fallbacks; top worship card content and parallax are unchanged.
- Synchronized release/footer/package/content/asset versions to v1.0.15. Tailwind build, seven existing tests, syntax/integrity checks, CSS parsing, and fallback-versus-JSON schedule checks passed before the approved beta deployment. AGENTS.md unchanged.

## 1.0.14 — October 6, 2026

- After explicit approval, deployed to beta Hosting. Published checks verified zero branch canvases/particles/pause controls, v1.0.14 script/footer, retained desktop fixed-background and mobile scrolling parallax at 390px, no horizontal overflow, and no console errors/warnings. Production unchanged.
- Removed branch sway, its WebGL module/canvas styles, and the Pause animation / Resume animation control. Confirmed no seasonal particles or particle code remain; removed the branch-specific crop tests and related module check entries.
- Preserved the original desktop/mobile scrolling parallax and reduced-motion support, following the user's explicit clarification. Seasonal artwork and automatic/manual theme selection remain.
- Synchronized footer, package/content versions, and CSS/module URLs to v1.0.14. Tailwind build, seven remaining content tests, module syntax, site integrity, removal/parallax checks, and CSS parsing passed before the approved beta deployment.

## 1.0.13 — October 6, 2026

- After explicit approval, deployed to beta Hosting. Verified all four seasons render the branch canvas with zero particles, changes confined to the right branch region, identical paused frames, scenic-band alignment, 390px mobile rendering, and no console errors/warnings. Reloaded a cached preview to replace old v1.0.12 HTML. Production unchanged.
- Removed all seasonal falling particles at the user's request. Replaced them with a gentle, localized bend in two right-hand branch regions of the original seasonal artwork. Mountains, page content, and the rest of the scene stay stationary.
- Added a small WebGL module to render the existing images with the desktop fixed-background and mobile cover crops. Retained pause/resume, reduced-motion behavior, and hidden-tab/offscreen pauses; capped rendering at 24 fps and canvas pixel density. Unsupported graphics or context loss fall back to the original static scenes.
- Synchronized footer, package/content versions, and CSS/module URLs to v1.0.13. Tailwind build, nine tests, syntax/integrity checks, CSS parsing, and targeted runtime behavior checks passed before the approved beta deployment.

## 1.0.12 — October 6, 2026

- After explicit approval, deployed to beta Hosting. Published review confirmed four-season switching, pause/resume, reduced mobile particle counts at 390px, footer v1.0.12, no horizontal overflow, and no console errors/warnings. Physical iPhone/Safari review remains pending. Production unchanged.
- Added gently drifting SVG leaves, snowflakes, flower petals, and dandelion seeds to the existing seasonal hero and Youth Hub backgrounds. Effects follow automatic/manual seasonal selection and stay behind the scenic wash and readable content.
- Added a pause/resume button, reduced particle counts on mobile, and automatic pauses for hidden tabs and offscreen scenes. Reduced-motion preferences hide the effects; CSS animates the particles without an additional JavaScript frame loop.
- Synchronized footer, manifest, content, and asset URL versions. Tailwind build, seven existing tests, syntax/site integrity checks, CSS parsing, and targeted runtime behavior checks passed before the approved beta deployment.

## 1.0.11 — October 6, 2026

- After explicit approval, deployed to beta Hosting. Verified the published #808080 heading, content-loaded footer v1.0.11, ward-logo loading, and no console errors/warnings. Production unchanged.
- Changed Welcome home to the user-requested medium grey #808080.
- Synchronized release versions/asset URLs to 1.0.11. Existing syntax/content/integrity checks and CSS parsing passed. Awaiting beta deployment approval; no deployment or migration performed.

## 1.0.10 — October 6, 2026

- After explicit approval, deployed to beta Hosting. Verified the published #D3D3D3 heading, footer v1.0.10, ward-logo loading, and no console errors/warnings. Production unchanged.
- Changed Welcome home to the user-requested lighter grey #D3D3D3.
- Synchronized release versions/asset URLs to 1.0.10. Existing syntax/content/integrity checks and CSS parsing passed. Awaiting beta deployment approval; no deployment or migration performed.

## 1.0.9 — October 6, 2026

- After explicit approval, deployed to beta Hosting. Verified the published #55565B heading beside the ward logo, footer v1.0.9, and absence of console errors/warnings. Production unchanged.
- Changed Welcome home to charcoal grey #55565B so the darker ward logo has stronger visual emphasis. Other page text and logo colours are unchanged.
- Synchronized release versions/asset URLs to 1.0.9. Syntax, existing content tests, site integrity/version checks, and CSS parsing passed. Awaiting beta deployment approval; no deployment or migration performed.

## 1.0.8 — October 5, 2026

- Saved the user's October 6 resume note: confirm the production Hosting target before migration because both existing site folders currently map staging to test-blackstoneward. Documentation only; website remains v1.0.8.
- After explicit approval, deployed to beta Hosting. Verified the full-row Youth Hub and four equal-size compact tiles at 390px and 320px, no clipped content or horizontal overflow, unchanged five-column desktop layout, and footer v1.0.8. No console errors/warnings; production unchanged.
- Made Youth Hub span the full first row on mobile. The other four organization tiles now use a compact, equal-size two-column/two-row grid, including Sunday School.
- Reduced the four smaller tiles' padding, heading/icon size, and minimum height; retained desktop layout and Youth Hub prominence.
- Synchronized release versions/asset URLs to 1.0.8. Existing syntax/content/integrity checks and CSS parsing passed. Awaiting beta deployment approval and mobile browser review; no deployment or migration performed.

## 1.0.7 — October 5, 2026

- After explicit approval, deployed all 17 public files to beta Hosting. Verified the new logo and introduction, v1.0.7 footer, desktop/tablet/mobile navigation/layout, and no console warnings/errors or horizontal overflow. Production and Youth Hub unchanged.
- Updated the text beneath Welcome home to: This Ward Hub displays activities, lessons, and admin tools for each ward organization.
- Includes the pending horizontal ImageGen logo and responsive header sizing from 1.0.6.
- Synchronized release versions/asset URLs to 1.0.7. Existing syntax/content/integrity checks and direct logo/copy checks passed. Awaiting beta deployment approval; no deployment or migration performed.

## 1.0.6 — October 5, 2026

- Created a transparent horizontal logo with built-in ImageGen: larger Blackstone / Ward wordmark, two left-aligned lines to the right of the existing steeple/angel silhouette.
- Saved the new logo and exact prompt; preserved the original portrait asset. Updated responsive header sizing and tablet navigation wrapping for the wider logo.
- Synchronized all release versions/asset URLs to 1.0.6. Visually inspected the generated logo; existing syntax/content/integrity checks passed. Awaiting beta deployment approval and published header review; no deployment or migration performed.

## 1.0.5 — October 5, 2026

- After explicit approval, deployed to beta Hosting and verified the corrected live title, unchanged 7 PM Eastern start, footer v1.0.5, and absence of console errors/warnings. Production and Youth Hub unchanged.
- Corrected the first calendar title to Youth Fireside: "Dare Mighty Things!"; retained its date, time, and location.
- Synchronized package, lockfile, content, footer, and asset URL versions to 1.0.5.
- Syntax, seven existing content/date tests, site integrity, and version consistency checks passed before deployment. No production migration performed.

## 1.0.4 — October 5, 2026

- After explicit approval, deployed the full pending build to test.blackstoneward.org. Corrected cached asset delivery with matching v1.0.4 CSS/module URLs and enforced their synchronization in AGENTS.md and integrity checks.
- Verified published worship/welcome/footer copy, all three event start times, the conference announcement link, mobile navigation/right-aligned footer, and no horizontal overflow or console errors/warnings. Production and Youth Hub remain unchanged.
- Added confirmed Eastern start times: October 14 Youth Fireside at 7 PM, October 20 Youth Temple Trip at 7 PM, and October 24 Halloween Party at 5 PM.
- Removed their date-only flags and temporary day-boundary end timestamps; event end times remain unspecified.
- Updated the footer and synchronized project/content versions to 1.0.4 as required after every website update. Includes all pending 1.0.3 changes.
- Syntax, seven content/date tests, site integrity, matching versions, and all three formatted start times passed verification. Awaiting beta deployment approval; no deployment or migration performed.

## 1.0.3 — October 5, 2026

- Updated Sunday Services and the welcome section with the confirmed 12:00 PM Sunday meeting at 91 Jordan Road, Franklin MA.
- Removed Plan your visit, the blue View calendar hero link, Every member has a place, and the pending public-contact notice.
- Added the October 2026 General Conference recordings link and the three supplied October 14/20/24 events. Events display dates only, without invented start times, and expire after their Eastern event day.
- Changed the footer identity to the ward/stake names and replaced Contact with v1.0.3, read from the public content version.
- Added the standing footer-version rule to AGENTS.md and checks keeping package, lockfile, public content, and HTML footer versions synchronized.
- Tailwind build, JavaScript syntax, seven content/date tests, asset/anchor/content integrity, version consistency, and staging-only Hosting checks passed. Code complete; beta deployment awaits explicit approval. Production and Youth Hub unchanged.

## 1.0.2 — October 5, 2026

- After explicit user approval, deployed the approved build to test.blackstoneward.org using Hosting-only staging deployment; all 16 public files released successfully.
- Verified custom-domain content version, all four seasonal themes, desktop parallax, mobile responsive layout/menu, updated logo/icons, and absence of browser console warnings/errors. Production and Youth Hub migration remain unchanged.

- Enlarged the ward logo on desktop/mobile and adjusted the mobile menu position for its taller header.
- Removed the blue ward/stake line from the hero and removed the corresponding script assignment.
- Used the supplied central RS monogram, a plain Bishopric steeple, and a clean handshake for Elders Quorum. Included the handshake icon license.
- Updated Relief Society description to Ministering & service.
- Recorded the approved Codex editing tools and Website-New development location in AGENTS.md, keeping beta-first deployment and explicit approval requirements.
- Visually inspected the rendered icons. Build, syntax, six existing content tests, local asset/hosting checks, CSS parsing, requested edit checks, mobile menu positioning, and matching versions passed. No deployment or migration performed.

## 1.0.1 — October 5, 2026

- Corrected desktop parallax to use fixed CSS scenery while foreground content scrolls, matching the auction site instead of subtle JavaScript background drift.
- Desktop motion remains visible if local-file restrictions block ES modules; reduced-motion preferences disable the fixed effect.
- Preserved mobile motion and seasonal styling. Edited the correction in the native BBEdit editor.
- Verification passed: CSS parsing, desktop/reduced-motion rules, matching patch versions, six existing content tests, and asset/hosting checks. No deployment or other website changes. Interactive browser review remains pending.

## 1.0.0 — October 5, 2026

- Built the approved one-page ward homepage in the user-requested Website-New folder, preserving the reference images.
- Added four seasonal landscapes with coordinated backgrounds, automatic season selection, manual override, and an optional seasonal review toolbar.
- Added desktop/mobile parallax with reduced-motion support, responsive navigation, organization gateways, ward events and announcements, Youth Hub callout, and contact section.
- Added a local public content file with publication/expiry windows, safe text/link rendering, Eastern event dates, and expandable lists.
- Configured all planned organization destinations using .org. Youth links stay on the existing hub until migration; future organizations remain inactive.
- Added a local Tailwind build, meaningful content/date/link checks, and Hosting-only staging configuration.
- Copied AGENTS.md unchanged from Website-beta. No deployment, DNS, database, rules, functions, or existing website edits performed.
- Validation: Tailwind compilation, JavaScript syntax, six content/date/link checks, and all local asset/anchor/hosting integrity checks passed. Interactive browser review remains pending.
