# Blackstone Ward homepage project state

**Version:** 1.2.22
**Date:** October 23, 2026
**Workspace:** Website-New, explicitly requested by the user
**State:** Version 1.2.22 explicitly approved and deployed to live production Hosting (`blackstoneward` / `blackstoneward.org`) and staging (`test.blackstoneward.org`). Configures WebAuthn Relying Party ID apex domain scoping (`blackstoneward.org`), enables internal platform transport (`TouchID`/`FaceID`) targeting, and adds inline onboarding hints to eliminate unexpected cross-device QR code prompts.
**Production URL:** https://blackstoneward.org/
**Staging target:** test.blackstoneward.org (test-blackstoneward Hosting site)
**GitHub Repository:** https://github.com/tueini/Blackstone-Ward-Homepage (branch: `main`)

## Implemented

- WebAuthn Passkey Relying Party Apex Scoping & Biometric Guidance:
  - **Apex Domain RP ID (`blackstoneward.org`)**: Added `getWebAuthnRpId()` helper in `public/admin/admin-app.js`. WebAuthn Relying Party ID is scoped to `blackstoneward.org` when running on any Blackstone Ward subdomain (`test.blackstoneward.org`, `blackstoneward.org`, etc.), allowing passkeys created on staging or production to be shared without domain mismatch, falling back to hostname on `localhost`.
  - **Internal Platform Authenticator Targeting**: Saved raw credential ID bytes (`rawId`) upon enrollment in local storage, and passed `allowCredentials` with `transports: ['internal']` in `handlePasskeyLogin()` when local records exist, directly prompting native macOS Touch ID / Face ID instead of falling back to external cross-device QR codes.
  - **Inline User Guidance (`#passkey-hint-msg`)**: Added inline warning message in `public/admin/index.html` explaining to the user if no Touch ID passkey is found on the current device and directing them to sign in via phone text to complete 1-tap onboarding.

- Cross-Subdomain SSO Cookie Bridge (`ward_auth_session`):
  - **Shared Cookie Authentication**: Implemented `ward_auth_session` cookie bridge in `public/admin/admin-app.js` with `.blackstoneward.org` domain scoping in production (falling back to current hostname on localhost and staging preview domains).
  - **Login Flow Integration**: Connected cookie issuance to Phone SMS OTP verification, WebAuthn Passkey (TouchID/FaceID) login, and Password login handlers, including automatic password hash stripping for security.
  - **Clean Session Teardown**: Updated `handleLogout()` to thoroughly clear `ward_auth_session` across all domain scopes.

- Dedicated GitHub Repository (`Blackstone-Ward-Homepage`):
  - Initialized Git on branch `main` in `Website-New/`.
  - Created public remote repository `https://github.com/tueini/Blackstone-Ward-Homepage`.
  - Committed and pushed all baseline code and assets at v1.2.20 with `origin/main` upstream tracking.


- 3-Line Calendar Event Text Wrapping (`line-clamp-3`):
  - **Expanded Title Visibility**: Switched event chip text clamping from `line-clamp-2` to `line-clamp-3` in `public/admin/admin-app.js` and `public/calendar/index.html`. Long activity titles (such as *"Blackstone Ward Christmas Party"*, *"Tri-Ward Halloween Trunk-or-Treat"*, or *"Relief Society Ministering Social"*) now display completely across 3 lines with zero truncation.
  - **Rebuilt Utility Asset**: Recompiled `./public/assets/tailwind.css` via Tailwind CLI to incorporate `.line-clamp-3`.

- Desktop & Laptop Calendar Cell Width Increase (+5px):
  - **Grid Width Expansion**: Increased the interior width of the 7-day calendar grid by 35px on desktop and laptops (`lg:` breakpoint) by adjusting calendar card horizontal padding from 32px to 14.5px (`lg:px-[14.5px]`). This delivers exactly +5.0px of additional width to each of the 7 day cells (from ~96px to ~101px on the public calendar, and from ~105px to ~110px on the Admin Portal).
  - **Responsive Minimum Width Floor (+5px)**: Raised the horizontal scroll minimum width from `min-w-[540px]` to `min-w-[575px]` in both `public/calendar/index.html` and `public/admin/index.html`, giving cells an extra 5px of minimum width even on narrow screens.
  - **Compiled Tailwind 4 Asset**: Recompiled `./public/assets/tailwind.css` via Tailwind CLI to incorporate `.lg:px-[14.5px]` and `.min-w-[575px]`.

- Calendar Event Chip Readability & Layout Enhancements (Admin & Public):
  - **Text Wrapping & Truncation Relief**: Removed rigid single-line truncation from event chips on both `admin-app.js` and `calendar/index.html`. Applied `whitespace-normal break-words leading-tight line-clamp-2` so event names wrap to multiple lines and show substantially more title text before clipping.
  - **Font Size & Weight Tuning**: Reduced event chip text from `text-[11px]` to `text-[10px]` and removed bold/semi-bold styling (`font-normal`), allowing more characters per line and producing a refined, legible calendar aesthetic.
  - **Top-Aligned Category Badges**: Updated chip flex alignment to `items-start` with a subtle top margin on category indicator dots, keeping dots neatly aligned with the first line of wrapped text.
  - **Taller Calendar Cells**: Increased cell min-heights from `min-h-[105px] sm:min-h-[115px]` to `min-h-[125px] sm:min-h-[135px]` in the Admin Portal and from `min-h-[96px] sm:min-h-[110px]` to `min-h-[120px] sm:min-h-[130px]` in the public calendar, comfortably accommodating multi-line event chips.

- Multi-Month Ward Calendar Event Persistence & Display:
  - **Removed Hardcoded Month Fence**: Lifted the temporary `2026-10` month filtering in `public/admin/admin-app.js` and `public/calendar/index.html`. Events across all months (such as December 5th) now immediately persist in cache, sync via real-time Firestore `onSnapshot` listeners, and render on both the monthly calendar grid and list view.
  - **Youth Hub Multi-Month Transfer**: Updated `openYouthHubTransferModal` in `admin-app.js` to allow transferring any upcoming scheduled events rather than restricting to October.
  - **Firestore Deduplication**: Removed 3 duplicate partial drafts from repeated save attempts in `Ward_events`, leaving the final complete *"Blackstone Ward Christmas Party"* event intact.

- First-Login TouchID / FaceID Onboarding Walkthrough:
  - **One-Time Welcoming Prompt (`#passkey-prompt-modal`)**: Immediately after a new leader signs in with their phone text code, the dashboard presents a gentle, personalized walkthrough dialog: *"Welcome, [Name]! Would you like to enable TouchID / FaceID on this device?"*
  - **1-Click Biometric Enrollment**: Clicking **"Enable TouchID / FaceID Now"** triggers the platform authenticator directly so the leader can touch their sensor once and be fully set up for future 1-tap logins.
  - **Gentle Dismissal & Persistence**: Clicking **"Maybe Later"** stores a dismissal preference (`wardPasskeyPromptDismissed`) so leaders aren't nagged, while the green **"Enable TouchID / FaceID"** button remains available in the header whenever they wish to activate it later.

- Always-Visible TouchID / FaceID Login Button & Passkey Autofill Coexistence:
  - **Always Visible by Default**: Removed the `hidden` class from `#passkey-login-container` in HTML and removed the local storage pre-check gate in `checkAuth()`, ensuring the prominent green **"Sign In with TouchID / FaceID"** button is immediately visible to any leader on modern biometric-enabled devices (Mac, iPhone, iPad, Android, Windows).
  - **Universal Biometric Invocation**: Updated `handlePasskeyLogin()` in `admin-app.js` to invoke `navigator.credentials.get` directly without requiring pre-existing `wardPasskeyRegistered` local storage records, with automatic leader profile restoration and clear helpful prompts.
  - **Restored TouchID / FaceID Nomenclature**: Restored explicit **"Sign In with TouchID / FaceID"** and **"Enable TouchID / FaceID"** action labels.
  - **Dual-Path WebAuthn Support**: Leaders can sign in either by clicking the prominent 1-tap green button or via keyboard autofill when tapping the name field.

- WebAuthn Conditional UI (Passkey Autofill) & Biometric Inclusivity:
  - **Browser Autofill Integration (`autocomplete="username webauthn"`)**: Added WebAuthn autofill tags to the leader name inputs on both the phone login view (`#admin-name-lookup`) and the fallback password login view (`#password-leader-lookup`).
  - **Conditional UI Mediation (`PublicKeyCredential.isConditionalMediationAvailable`)**: Implemented non-blocking background passkey listener (`navigator.credentials.get({ mediation: 'conditional', ... })`) so registered leaders immediately see their passkey suggestion in their device keyboard/autofill bar.
  - **AbortController Lifecycle Management**: Coordinated active passkey autofill requests with an `AbortController` to cleanly abort conditional listeners upon successful login (via SMS, password, or manual passkey) or when switching authentication views, preventing browser conflicts.
  - **Discoverable Resident Key Support (`residentKey: "preferred"`)**: Updated `navigator.credentials.create` during passkey registration to request resident keys, enabling true discoverable credential autofill across platform authenticators.
  - **Inclusive Cross-Platform Biometric Terminology**: Replaced legacy "FaceID / TouchID" labels with "Passkey / Biometrics" across the login button, registration button, and success dialogs, welcoming Android (fingerprint/face unlock) and Windows Hello alongside Apple Touch ID/Face ID.

- High-Contrast Text Fix on Dark Admin UI Elements:
  - **CSS Rule Scope Correction (`/assets/admin.css`)**: Narrowed legacy dark-card typography overrides so they only apply to paragraphs and text within `.bg-slate-900` and `.bg-slate-800` cards rather than all non-button descendants in `#dashboard-view`.
  - **Leader Avatar Circle Initials**: Corrected text color on `#leader-avatar-initials` so the leader initials ("DH") render in pure white (`#ffffff !important`) against the navy circular badge (`#152548`).
  - **Calendar View Toggle Button**: Corrected text color on `#btn-view-calendar` and wrapped its text inside `<span>Calendar</span>` with explicit active/inactive white-text styles in `admin.css`, HTML, and `admin-app.js`.

- Ward Calendar Scoped Exclusively to October 2026:
  - **Local Cache & Storage Purge**: Both `/admin/` and `/calendar/` automatically purge any events outside of October 2026 (`2026-10`) from `localStorage` (`local_ward_events`) and active state on startup.
  - **Real-Time Snapshot Filtering**: The Firestore `Ward_events` listeners on `/admin/` and `/calendar/` strictly accept and render events with dates in October 2026, preventing any stale or out-of-month events from appearing.
  - **Transfer Modal Scoped to October 2026**: The "Transfer from Youth Hub" bulk import dialog in `/admin/` now only presents October 2026 Youth Hub activities for transfer, preventing accidental transfer of future-month events to the Ward calendar.

- Youth Hub Calendar Event Recovery & Complete Collection Isolation:
  - **Restored Deleted Youth Hub Events**:
    - Recovered and restored `Halloween Party` (`2026-10-24_halloween_party_700`: Meetinghouse @ 7:00 PM, category `social`, type `scheduled`) to the Youth Hub's `Combined_events` Firestore collection.
    - Recovered and restored `Tri-Ward Halloween Dance` (`2026-10-24_tri_ward_halloween_dance_512`: Tri-Ward Halloween Dance @ 7:00 PM, category `combined`, type `scheduled`) to the Youth Hub's `Combined_events` Firestore collection.
    - Verified direct document presence in Firestore via REST API verification.
  - **Complete Write & Delete Isolation**:
    - Removed previous dual-write `setDoc(doc(db, "Combined_events", id))` from `saveEvent()` in `/admin/admin-app.js`.
    - Confirmed `deleteEvent()` in `/admin/admin-app.js` only executes `deleteDoc(doc(db, "Ward_events", id))`.
    - The Ward homepage and Ward Admin portal now treat `Combined_events` as strictly read-only (used solely for on-demand bulk transfer preview). No document in `Combined_events` can ever be modified or deleted from the Ward application.

- Youth Hub Manual Transfer Workflow & Delete Safety Guard:
  - **No Auto-Copy / Duplicate Elimination**: Discontinued automatic background merging of `Combined_events` into the Ward Calendar on both the homepage, public calendar, and admin portal. The Ward Calendar only displays events explicitly created on or transferred to the Ward Calendar.
  - **Manual Bulk Transfer Workflow (`/admin/`)**:
    - Added "Transfer from Youth Hub" action button to the Ward Calendar header.
    - Dedicated interactive modal (`#youth-import-modal`) listing all current and upcoming activities from the Youth Hub's `Combined_events` collection.
    - Displays activity date, time, title, location, and status ("Already on Ward Cal" or "Available").
    - Features "Select All Available" checkbox, dynamic selection count indicator, and one-click bulk transfer (`Transfer Selected`).
    - Transferred activities are added to the Ward Calendar under the **Youth** category with `sourceYouthId` reference.
  - **Delete Protection Guard**: Updated `deleteEvent` in the Ward Admin portal to delete only from the Ward Calendar (`Ward_events`). It never calls `deleteDoc` on `Combined_events`, guaranteeing that deleting an activity from the Ward Calendar leaves the original Youth Hub calendar safe and intact.

- Youth Org Activity Calendar Format (`/calendar/` and `/admin/`):
  - **Dedicated Public Activity Calendar Page (`/calendar/`)**:
    - Created standalone public Activity Calendar page replicating the Youth Org layout.
    - Two-column responsive grid on desktop:
      - **Left 2-Column Card**: Rounded-3xl card with bold serif title "Activity calendar", pill switcher for `[Calendar]` and `[List]` views, month pagination (`← Month Year →`), day-of-week headers (`SUN MON TUE WED THU FRI SAT`), and dynamic 7-column day grid.
      - **Day Cells & Event Chips**: Days from previous and next months rendered with muted styling. Today highlighted with an orange border (`border-2 border-[#F59E0B]`). Events rendered as styled category chips with colored indicator dots and truncated titles.
      - **Category Labels & Color Coding**: Ward (teal `#007B91`), Bishopric (purple `#8B5CF6`), EQ (blue `#3B82F6`), RS (pink `#EC4899`), SS (amber `#F59E0B`), and Youth (emerald `#10B981`).
      - **Event Detail Modal**: Clean popup dialog displaying full activity title, date, time, location, description, and "Add to Calendar" single-event ICS export.
      - **Bottom Navigation**: `‹ Today / Current month` quick jump and `Download schedule ↓` full .ics calendar export.
      - **Right Sidebar**: "UP NEXT" card with lavender date badge (`OCT 24`), bold serif title, location pin, time icon, and `View activity →` action button. Accompanied by "Good to know" information card.
      - **Data Resilience & Youth Hub Integration**: Dual real-time Firestore subscriptions to `Ward_events` and `Combined_events`. Activities posted in the Youth Hub's Combined calendar automatically sync directly into the Youth category on both the public calendar and Ward Admin portal, with instant offline fallback to `localStorage` (`local_ward_events`) and `/data/ward.json`.
  - **Ward Admin Portal Calendar Tab (`/admin/`)**:
    - Upgraded `#section-calendar` from 12 mini month cards to the exact same 2-column Activity Calendar layout.
    - Integrated with Ward Admin CRUD workflows: clicking any event chip directly opens the event editor modal (`openEventModal`), and clicking any day cell opens the scheduler prefilled with that date.
    - Right sidebar features dynamic "UP NEXT" card with an `Edit activity →` button and "Preview public calendar" link.
    - Admin calendar includes month navigation, today jump, and .ics export.
  - **Site-Wide Navigation Updates**:
    - Updated navigation menu in `public/index.html` and `public/spotlights/index.html` to point to `/calendar/`.
    - Added "Ward calendar →" direct jump link from the homepage "Coming up" section to `/calendar/`.

- Strict First and Last Name Entry (No Dropdowns) on Login Screen:
  - Completely removed browser datalist dropdowns from phone login (`#admin-name-lookup`), password login (`#password-leader-lookup`), and self-service reset (`#reset-name-input`).
  - Set default placeholder text to "Type your first and last name" across all leader name inputs.
  - Enforced validation requiring users to type at least two name parts (first and last name) before sending text codes or signing in.
  - Dynamic verification indicator (`Leader Verified`) activates as soon as a recognized first and last name is typed.
  - Enhanced error handling for Firebase SMS anti-abuse rate limits (`auth/too-many-requests`) directing users to sign in via password or biometric passkey.

- Granular Role-Based Access Control (RBAC) Permissions (`/admin/`):
  - **Ward Administrator**: Can change all passwords across all leaders and organizations, and retains full add, edit, onboard, and removal authority for all profiles.
  - **Bishopric**: Can change passwords for Bishopric members and all other users; CANNOT change passwords for, edit, onboard, or remove the Ward Administrator. Can add, edit, onboard, and set passwords for all non-administrator users. Role select dropdown prohibits Bishopric from assigning the Ward Administrator role.
  - **Other Organization Users** (Relief Society, Elders Quorum, Primary, Sunday School, Mission): Authorized Leaders tab is accessible so they can change passwords for leaders in their own calling/organization. Forbidden from changing passwords for other organizations, Bishopric, or Ward Administrator. Forbidden from adding, editing, onboarding, or removing leaders.
  - **Protected Row UI & Table Security**: Leaders that the current user is unauthorized to modify display a clean "Protected" badge with a lock icon instead of an action dropdown. Row selection checkboxes are only rendered for rows where the user has delete or onboard authority. Bulk action bars and "+ Add Ward Leader" button are automatically hidden for unauthorized roles.
  - **Logic & Cloud Guards**: Server-enforced permissions on `saveLeader`, `deleteLeader`, `openAdminSetPasswordModal`, `saveAdminSetPassword`, `openOnboardModal`, and bulk actions.

- Login Security & Privacy Overhaul:
  - Removed pre-filled phone number and name from the login page.
  - Complete clean-slate on logout and initial visit: zero prior data is retained or displayed.
  - Users select their name from scratch and type their phone number independently.
  - Verifies that entered phone numbers match the registered phone for the selected leader before sending SMS verification codes.
  - Removed phone numbers from public HTML datalists to prevent exposing leader contact information.
- Personal Leader Password Authentication:
  - Unified "Sign In with Password" flow allowing leaders to sign in using their own personal password if they don't have their mobile phone, with fallback to master passwords.
  - Secure SHA-256 password hashing.
  - Show/hide password visibility toggle with monochromatic 2D eye icons.
- Admin User Password Management (Authorized Leaders Tab):
  - Added "Leader Personal Password" field to Leader Modal (`#leader-modal`) with status indicator ("Password set" / "No password set").
  - Added "Set Password" action to the row action dropdown in the Leaders table.
  - Dedicated Admin Set Password modal with instant secure password generator (`Blackstone###!`) and 1-click clipboard copy.
- Self-Service Password Reset Flow:
  - "Forgot password?" self-service reset modal accessible from the password login screen.
  - Two-step SMS verification via Firebase Phone Auth before allowing a user to set their new password.
  - Updates SHA-256 hash in Firestore and cache, and smoothly transitions back to login.

- Prominent Logged-In Account Identity in Admin Portal Header (`/admin/`):
  - Displays user avatar with initials ("DH"), full name ("Duane Harris"), green active-session indicator, calling badge ("Ward Administrator"), and registered email (`tueini@gmail.com`).
  - Automatic session upgrade: Automatically checks and upgrades stale `sessionStorage` sessions (e.g., legacy "Master Admin") to Duane Harris's administrator profile upon authentication check.
- Resilient Local-First Ward Calendar, Announcements, and Spotlights Architecture:
  - Immediate local memory cache update and `localStorage` persistence (`local_ward_events`) guaranteeing that newly created or edited items display instantly on the 12-month calendar grid and list view without blocking.
  - Non-blocking background Cloud Firestore dual-write to `Combined_events` (which has active read/write permissions under current security rules) and `Ward_events`.
  - Caught background cloud sync errors to prevent unhandled rejections and eliminate intrusive permission alert popups while operating.
- Server-Enforced Authentication (SEA) & Role-Based Access Control (RBAC) in Ward Admin Portal (`/admin/`):
  - Passwordless Cell Phone authentication via Firebase Auth Phone SMS (6-digit OTP).
  - Biometric Passkey / WebAuthn 1-tap login supporting Apple FaceID / TouchID and Android fingerprint.
  - Authorized Leaders registry in Firestore (`ward_leaders`) mapping phone numbers to callings (Ward Admin, Bishopric, Relief Society, Elders Quorum, Primary, Sunday School, Mission).
  - Dynamic leader identity badge in header displaying authenticated leader's name and calling.
  - Calling-based view filtering restricting access to administrative settings.
  - Leaders management interface in Settings allowing Admins to register and edit leaders.
  - Master passcode fallback retained for emergency access.
- One-page whole-ward homepage following the approved autumn design and auction-site parallax direction.
- Ward Admin Portal at `/admin/` with 12-month calendar overview grid, list view, and event management.
- Ward Calendar feeds into the Ward Homepage "Coming Up" card via Firestore collection `Ward_events`, with graceful local `ward.json` fallback.
- Settings sub-navigation inside Admin Portal:
  - Homepage Announcements manager (`ward_announcements`) with pinning, published toggles, and live updates on homepage.
  - Ward Spotlights manager (`ward_spotlights`) for managing member and family spotlight profiles.
  - Authorized Leaders & Access manager (`ward_leaders`) with role assignments.
- Protected Ward Spotlights public page at `/spotlights/` with member-protected unlock modal (`hashInput` verification against approved hashes/names) and detailed spotlight lightbox modal.
- Added Spotlights navigation link to the main header and Admin link to the site footer.
- Removed `/admin` redirect from `firebase.json` so the local admin portal is served directly.
- Matching seasonal hero/background sets: fall beige, winter light blue, spring light green, summer light yellow.
- Seasonal scenery has no branch sway, falling particles, canvas renderer, or animation pause control. Original seasonal PNGs and automatic/manual theme selection remain.
- Original desktop fixed-background and mobile scrolling parallax remain, including reduced-motion support, following the user's explicit clarification to retain parallax.
- Automatic Massachusetts season selection with a content-file manual override and optional `?preview=1` review toolbar.
- Approved steeple/angel logo, responsive mobile navigation, organization cards, events, announcements, Youth Hub callout, welcome/contact section.
- Screenshot-based white bottom section with black sans-serif text, centered welcome/address and Weekly Services & Activities heading, and a responsive two-column schedule. Footer ward/stake identity is centered above a divider, with the season and current version centered below it.
- Bottom address, weekly schedule, ward/stake identity, and season/version use the same font size as “Activities, events, and protected youth spotlights.”: 16px desktop and 15px at widths of 760px or less. Headings keep their existing larger sizes.
- Weekly heading and schedule share the same left edge inside a centered content-width block capped at the available width. The table sizes its columns to content; service names have 32px right padding on desktop and 20px on mobile to separate the left-aligned times.
- The supplied meetinghouse name, ZIP code, and five weekly schedule rows are in the public worship JSON and have matching HTML fallbacks. Primary recurrence displays superscript ordinal suffixes; dynamic content is rendered safely as text.
- Local public JSON content with publish/expiry filtering, Eastern date formatting, event/announcement expand controls, safe text rendering and HTTPS links.
- Youth Hub currently links to its existing root; the configured subdomain activates after its readiness flag changes. Other organizations remain Coming soon.
- Compiled Tailwind CSS plus local custom CSS and vanilla ES modules; no runtime frontend framework.
- Hosting-only staging configuration and date/content/link integrity checks.

## Rules and scope

AGENTS.md was initially copied from Website-beta and now records the user's approved workflow: Codex built-in file-editing tools or native editors may edit scoped source files; terminal source rewrites remain forbidden. Website-New is the development workspace. No local web server or browser subagent was used. The code-complete/approval checkpoint, beta-first deployment, and shared-database protections remain.

The original design PNGs in this folder remain untouched. Website-beta, production, Youth Hub routes, DNS, Firestore records/rules, Cloud Functions, and the iPhone prototype have not been modified.

## Content and review pending

- Sunday meeting time and meetinghouse address are confirmed by the user: 12:00 PM, 91 Jordan Road, Franklin MA. The bottom screenshot additionally supplies Franklin Stake Center and ZIP code 02038, plus Sunday School at 01:05 PM, Youth/EQ/RS at 01:35 PM (label corrected by the user in v1.0.18), Youth Activities Wednesday at 07:00 PM, and Primary Activities second/fourth Wednesday at 07:00 PM. These are displayed as supplied.
- Public contact email/link remains blank until confirmed.
- Added the user-supplied October General Conference announcement and October 14, 20, and 24 events. Confirmed start times are respectively 7 PM, 7 PM, and 5 PM Eastern; dates now display those times.
- This version uses a local content file. Firestore content editing/connection is a future scoped change.
- Initial published-browser review passed at desktop and 390px mobile width, including seasonal controls, updated branding/icons, parallax settings, navigation, and local image loading. Physical iPhone/Safari and reduced-motion device review remain pending.
- Version 1.0.18 staging deployment was explicitly approved and completed; published label review passed. Version 1.0.17 desktop, 390px, and 320px alignment checks also passed. Physical iPhone/Safari and device-level reduced-motion review remain pending. Production release and Youth Hub migration need their own approval.

## Verification

- Version 1.1.1: Verified top main navigation menu order (`Home`, `Calendar`, `Spotlights`, `Admin`, `Contact us`), footer Admin link removal, version synchronization across all files, module syntax, 7 unit tests, and site integrity checks.
- After explicit approval, v1.1.1 Hosting-only staging deployment succeeded with 22 public files released to `test-blackstoneward` (`test.blackstoneward.org`). Verified live delivery of updated top navigation and footer release.
- Version 1.1.0: JavaScript syntax checks for `home.js`, `content.js`, and `admin-app.js`, seven content unit tests, site integrity, asset link resolution, and version synchronization (package.json, package-lock.json, ward.json, and HTML fallback) all passed cleanly.
- After explicit approval, v1.1.0 Hosting-only staging deployment succeeded with 22 public files released to `test-blackstoneward` (`test.blackstoneward.org`). Verified live HTTP delivery of v1.1.0 `ward.json`, `/admin/` portal, and `/spotlights/` public page.
- Version 1.0.18: JavaScript syntax, seven existing content tests, site/version/asset/Hosting integrity checks passed before the approved beta deployment. The public JSON and HTML fallback both use Youth/EQ/RS with Sunday @ 01:35 PM. No styles or layout changed, so no CSS rebuild was required. No local server or headless browser was used.
- After explicit approval, v1.0.18 Hosting-only staging deployment succeeded with 17 public files. Reloaded cached HTML and verified the v1.0.18 script/footer and rendered Youth/EQ/RS row at Sunday @ 01:35 PM. Saved output/ward-home-v1.0.18-bottom-desktop.jpg in the chat workspace and closed the temporary review tab.
- Version 1.0.17: Tailwind build, JavaScript syntax, seven existing content tests, site/version/asset/Hosting integrity checks, and CSS parsing passed before the approved beta deployment. No local server or headless browser was used.
- After explicit approval, v1.0.17 Hosting-only staging deployment succeeded with 17 public files. Reloaded cached HTML and verified v1.0.17 script/footer. All five service-name cells share the heading's left coordinate (438.72px desktop, 24.92px at 390px); all time cells share a separate left coordinate (623.80px desktop, 175px at 390px). Both columns are left aligned, with 32px desktop / 20px mobile padding between them. A 320px check confirmed the shared left edge and no overflow. No horizontal overflow or captured console errors/warnings. Saved output/ward-home-v1.0.17-bottom-desktop.jpg and output/ward-home-v1.0.17-bottom-mobile.jpg in the chat workspace. Restored normal viewport and closed the temporary review tab.
- Version 1.0.16: Tailwind build, JavaScript syntax, seven existing content tests, site/version/asset/Hosting integrity checks, and CSS parsing passed. No local server or headless browser was used. Local-file browser review was blocked by browser protocol policy; subsequent approved beta review passed.
- After explicit approval, v1.0.16 Hosting-only staging deployment succeeded with 17 public files. Reloaded cached HTML and verified v1.0.16 script/footer. Published computed sizes for the address, schedule, ward/stake identity, and version matched the Youth Hub sentence at 16px desktop and 15px at 390px. Headings remained larger; all five rows displayed, with no horizontal overflow or captured console errors/warnings. Saved output/ward-home-v1.0.16-bottom-desktop.jpg and output/ward-home-v1.0.16-bottom-mobile.jpg in the chat workspace. Restored normal viewport and closed the temporary review tab.
- Version 1.0.15: Tailwind build, JavaScript syntax, all seven existing content tests, site/version/asset/Hosting integrity checks, and CSS parsing passed. Verified all five HTML fallback rows match the public JSON schedule and the supplied meetinghouse/address/ZIP line. AGENTS.md was left unchanged after automatic review rejected an operational-file edit; the footer placement follows the user's latest screenshot request.
- After explicit approval, v1.0.15 Hosting-only staging deployment succeeded with 17 public files. Reloaded cached HTML and verified v1.0.15 script/footer, all five service rows, supplied address, and centered footer at desktop and 390px with no horizontal overflow. Saved output/ward-home-v1.0.15-bottom-desktop.jpg and output/ward-home-v1.0.15-bottom-mobile.jpg in the chat workspace. Restored the normal viewport and closed the temporary review tab.
- Version 1.0.14: Tailwind build, JavaScript syntax, all seven remaining content tests, site/version/asset/Hosting integrity checks, and CSS parsing passed. Confirmed that the branch module, canvas/particle code, and pause control are absent and that the original desktop fixed-background and mobile parallax code remain. No local server or headless browser was used.
- After explicit approval, Hosting-only staging deployment succeeded with 17 public files. Published review confirmed the v1.0.14 script and footer, zero canvases/particles/pause controls, desktop fixed backgrounds, and no horizontal overflow. At 390px, the hero background transform changed from 9.76px to 60.4px when scrolled to -422px, confirming retained mobile parallax. No captured console errors/warnings. Restored normal viewport and #home; saved output/ward-home-v1.0.14-fall.jpg in the chat workspace.
- Version 1.0.13: Tailwind build, all module syntax checks, seven existing content tests, two new desktop/mobile image-alignment tests, site/version/module/Hosting integrity checks, and CSS parsing passed. A Node runtime harness verified image readiness, user pause, hidden-tab/offscreen pauses, reduced-motion changes, stale seasonal-load rejection, and graphics-context-loss fallback. No local server or headless browser was used.
- After explicit approval, Hosting-only staging deployment succeeded with 18 public files. Published browser checks confirmed successful branch-canvas rendering for all four seasons, zero particles, v1.0.13 module URL, correct scenic-band alignment, mobile canvas readiness at 390px, no horizontal overflow, and no console errors/warnings. Pixel comparison found changing pixels only in the right branch region while running and identical frames while paused. Restored normal viewport and automatic fall theme; saved output/ward-home-v1.0.13-fall.jpg in the chat workspace.
- A previously visited seasonal preview initially loaded cached v1.0.12 HTML despite fetching v1.0.13 content. Reloading the page loaded v1.0.13 scripts and removed the particles. Reviewers should reload an existing tab if old effects remain; footer content alone does not identify the cached script version.
- Version 1.0.12: Tailwind build, JavaScript syntax, all seven existing content tests, site/version/asset/Hosting integrity checks, and stylesheet parsing passed. A Node runtime check with a minimal DOM harness verified four-season particle creation, stable same-season updates, layer sizing, pause/resume, hidden-tab/offscreen pauses, and reduced-motion preference changes. No local server or headless browser was used.
- After explicit approval, Hosting-only staging deployment succeeded. Published browser review verified v1.0.12, running seasonal effects with matching backgrounds/shapes for all four seasons, pause/resume, and 20 hero/10 band particles on desktop versus 10/5 on a 390px mobile viewport. No horizontal overflow or captured console errors/warnings. Restored normal viewport and automatic fall theme; saved a desktop screenshot in the chat workspace at output/ward-home-v1.0.12-fall.jpg.
- Tailwind 4.3.3 compilation passed; generated stylesheet included and dependencies locked.
- JavaScript syntax checks passed.
- Six meaningful checks passed: all season boundaries in Massachusetts; draft/future/expired and ongoing events; pinned announcements; unsafe/contact links; Youth Hub migration self-loop; Eastern calendar display and invalid dates.
- Asset/style/import paths, HTML anchors/duplicate IDs, public content, and Hosting-only deployment scope passed integrity checks.
- Original AGENTS.md copy was verified byte-for-byte before the user's approved workflow amendments in 1.0.2.
- Website-beta's pre-existing working changes are unchanged.
- Published browser verification passed for 1.0.2 and 1.0.4 as recorded below. Physical iPhone/Safari review remains pending.

## 1.0.1 parallax correction

- Desktop hero and Youth Hub band now use fixed CSS backgrounds matching the auction reference; they do not rely on ES modules for the desktop effect.
- Mobile keeps its existing gentler JavaScript motion. Reduced-motion preferences switch to normal scrolling backgrounds.
- The correction and documentation were edited and saved inside BBEdit.
- Local-file module restrictions can still block seasonal controls and JSON content; desktop parallax is now independent of that script.
- Patch verification passed: CSS parsing, desktop fixed-background and reduced-motion rules, matching versions, all six existing content checks, and asset/hosting integrity checks. Interactive browser review remains pending. No deployment.

## 1.0.2 requested branding and card updates

- Enlarged the ward logo from 108 × 130 to 180 × 216 CSS pixels on desktop; mobile from 70 × 84 to 104 × 125. The mobile menu now opens below the taller header.
- Removed the blue ward/stake eyebrow line and its JavaScript assignment, preserving content initialization.
- Replaced the Relief Society leaf icon with the central RS monogram traced faithfully from the supplied reference into a local SVG; seal and motto omitted. The original reference image is unchanged.
- Removed the Bishopric cross and extended its steeple to a simple pointed top.
- Replaced the Elders Quorum drawing with the Lucide handshake SVG, with its ISC license included.
- Changed the Relief Society description to Ministering & service, matching Elders Quorum.
- Updated AGENTS.md to the approved Codex workflow and Website-New authoring location. Deployment gates remain.
- Visually inspected rendered card icons. Tailwind build, JavaScript syntax, six existing content tests, asset/hosting integrity, CSS parsing, requested edit checks, mobile menu positioning, and matching patch versions all passed. Full-page browser/device review remains pending. No migration or deployment.

## Approved beta deployment — October 5, 2026

- User replied approved after the code-complete checkpoint for version 1.0.2.
- Ran Hosting-only staging deployment from Website-New, explicitly targeting project blackstoneward-b861c and Hosting site test-blackstoneward. All 16 public files uploaded and the release succeeded.
- Published homepage: https://test.blackstoneward.org/ (Firebase fallback: https://test-blackstoneward.web.app/).
- Verified the custom domain serves ward.json version 1.0.2 with automatic season mode and the Youth Hub migration readiness flag still false.
- Browser verification: all four seasonal controls select matching hero images/background colors; automatic mode selects fall. Desktop logo measures 180 × 216 and background attachment stays fixed after scrolling. Updated RS/handshake/steeple card symbols render correctly.
- At a 390px viewport, logo measures 104 × 125, organization cards use two columns, information panels stack, navigation opens below the header and closes after selecting Organizations. No horizontal overflow or missing inline images detected. Normal homepage hides the review toolbar. Browser console contained no errors or warnings.
- Saved desktop/mobile review screenshots in the chat workspace output directory and left the published beta homepage open for the user.
- No local web server or browser subagent was used. Only the staging Hosting site changed; production, DNS, Firestore, security rules, Cloud Functions, and Youth Hub migration were untouched.
- This deployment retains version 1.0.2 because no application code changed. Unconfirmed worship/contact details and unsupplied ward announcements/events remain as documented.

## 1.0.3 requested service, content, and footer updates

- Changed the hero card to Sunday Services / Sacrament Meeting with the confirmed time and address on one line. Removed Plan your visit and the blue View calendar hero link.
- Removed Every member has a place beneath Find your organization.
- Added the General Conference recordings announcement linking to the user-supplied official October 2026 page; confirmed the destination opens and lists all four sessions.
- Added Youth Fireside: "Dare Might Things!" (October 14, Franklin Stake Ctr. firepit), Youth Temple Trip (October 20, Boston Temple), and Blackstone Ward Halloween Party (October 24, Franklin Stake Ctr.). All are 2026 date-only entries, with Eastern day boundaries for filtering; no activity start times are invented.
- Changed the welcome heading to All are welcome to the Blackstone Ward and its sentence to the supplied weekly Sacrament Services time/address. Removed the pending public-contact notice.
- Footer identifies Blackstone Ward • Blackstone Valley Massachusetts Stake; bottom-right Contact is replaced by v1.0.3. The footer reads the public content version and includes a matching HTML fallback. Its version/season group remains right-aligned when the longer stake name makes the mobile footer wrap.
- AGENTS.md now requires footer version updates after each website update using the existing Patch/Minor/Major policy. Integrity checks enforce matching package, lockfile, public content, and fallback footer versions.
- Build, JavaScript syntax, seven content/date tests (including date-only event display/expiry), local asset/anchor/content checks, footer version consistency, and staging-only Hosting scope checks passed.
- No local server, headless browser subagent, deployment, Firestore changes, production changes, or Youth Hub migration performed. Awaiting the explicit beta deployment approval required by AGENTS.md section 4.

## 1.0.4 confirmed calendar start times

- Applied the user's start times in event order: October 14 Youth Fireside at 7 PM; October 20 Youth Temple Trip at 7 PM; October 24 Halloween Party at 5 PM. October timestamps use Eastern daylight time (-04:00).
- Removed the date-only flags and temporary day-boundary end timestamps. No actual event end times have been supplied; existing upcoming-event behavior removes these entries once their start time has passed.
- Incremented the patch version from 1.0.3 to 1.0.4 under the standing rule requiring a version update after every website update. Package, lockfile, content, HTML footer fallback, and documentation match.
- JavaScript syntax, seven existing content/date tests, site integrity, version synchronization, and direct verification of all three rendered Eastern start times passed. No stylesheet/build changes were needed.
- No deployment or production/database/migration changes. This pending build includes all 1.0.3 changes and awaits explicit beta deployment approval.

## Approved 1.0.4 beta deployment — October 5, 2026

- User explicitly approved the pending build. Deployed Hosting only to staging target test-blackstoneward in project blackstoneward-b861c; all 16 public files finalized and released successfully.
- Initial published browser review caught an older cached home.js running against the new HTML. Completed the approved release with matching v1.0.4 query parameters on CSS and JavaScript asset URLs, including the content-module import. No approved page behavior/content changed; deployment stabilization retains the approved v1.0.4 release identifier.
- Added release asset-version synchronization to AGENTS.md and integrity checks. Seven content/date tests, syntax checks, asset/anchor checks, package/content/footer/asset version consistency, and Hosting scope checks passed before the corrected release.
- Confirmed published ward.json version 1.0.4, worship time/address, all three event timestamps, the conference link, and youth.ready still false.
- Browser visibly renders Sunday Services / Sacrament Meeting with 12:00 PM • 91 Jordan Road, Franklin MA; all three calendar entries at 7 PM, 7 PM, and 5 PM EDT; the General Conference recordings announcement; updated welcome text; ward/stake footer identity; and v1.0.4.
- Desktop and 390px mobile widths showed no horizontal overflow. Mobile navigation opens/closes correctly, and the version/season group stays aligned with the right edge of the footer. Content-unavailable notice is hidden, and browser console has no errors or warnings.
- Saved published full-page and calendar screenshots to the chat workspace output directory. Left the beta calendar open for review and reset the temporary mobile viewport.
- Only beta Hosting changed. Production, DNS, Firestore records/rules, Cloud Functions, and Youth Hub migration remain untouched. No local server or headless browser subagent was used.

## 1.0.5 calendar title correction — October 5, 2026

- Corrected the first calendar title from Youth Fireside: "Dare Might Things!" to Youth Fireside: "Dare Mighty Things!" as requested. Its October 14 date, 7 PM Eastern start, and location remain unchanged.
- Incremented the patch version and synchronized package/lockfile, public content, footer fallback, and CSS/module asset URLs to 1.0.5 under AGENTS.md.
- JavaScript syntax, seven existing content/date tests, asset/anchor/content integrity, and version synchronization checks passed. Styles are unchanged; no rebuild needed.
- No deployment, local server, headless browser subagent, production/database changes, or Youth Hub migration. Beta deployment awaits explicit approval under AGENTS.md section 4.

## Approved 1.0.5 beta deployment — October 5, 2026

- User explicitly approved v1.0.5. Hosting-only deployment to staging target test-blackstoneward in project blackstoneward-b861c succeeded; all 16 public files released.
- Pre-deployment checks passed: JavaScript syntax, seven existing content/date tests, site integrity, version synchronization, and Hosting-only scope.
- Published browser verification confirmed Youth Fireside: "Dare Mighty Things!", its unchanged October 14, 2026, 7:00 PM EDT start, and footer v1.0.5. Content-status notice is hidden; console contained no errors or warnings.
- Saved the published calendar screenshot in the chat workspace output directory and left the beta calendar open for review.
- Deployment-only documentation retains v1.0.5. Production, DNS, Firestore records/rules, Cloud Functions, and Youth Hub migration remain unchanged; no local server or browser subagent used.

## 1.0.6 horizontal logo — October 5, 2026

- Used the built-in ImageGen tool to edit the existing ward logo. Preserved its dark navy/teal steeple and trumpet-blowing angel silhouette; moved substantially larger title-case Blackstone / Ward to the right, in two left-aligned lines.
- Visually inspected the spelling, alignment, silhouette, and transparent background. Output is a 2019 × 779 PNG with alpha, saved as public/assets/ward-logo-horizontal-v1.0.6.png. The original portrait logo is preserved and remains the favicon.
- Saved the exact ImageGen prompt in zzdesignfiles/ward-logo-horizontal-prompt-v1.0.6.txt.
- Updated the header image reference/intrinsic dimensions and responsive sizing: 340px wide on desktop; adaptive 160–240px wide on mobile with natural height. Tablet navigation wraps beneath the wider logo to avoid crowding; mobile navigation retains its below-header positioning.
- Synchronized package, lockfile, content, footer fallback, and CSS/module URL versions to 1.0.6. Existing checks passed; browser verification of the revised header remains pending beta deployment approval.
- No local server, browser subagent, deployment, production/database changes, or Youth Hub migration performed.

## 1.0.7 Ward Hub introduction — October 5, 2026

- Confirmed the new ImageGen horizontal logo is wired into the header with larger Blackstone / Ward text and desktop/mobile sizing from 1.0.6. The pending build includes that logo update.
- Replaced the sentence below Welcome home with the exact user-supplied copy: This Ward Hub displays activities, lessons, and admin tools for each ward organization.
- Incremented the patch version to 1.0.7 and synchronized package/lockfile, public content, HTML footer fallback, and CSS/module URL versions.
- Existing syntax, seven content/date tests, site integrity, version synchronization, and direct checks of the header image/new introductory copy passed. Styles and logo asset did not change; no rebuild or image generation needed.
- No deployment, local server, headless browser subagent, production/database changes, or Youth Hub migration. Published header review follows explicit beta deployment approval under AGENTS.md section 4.

## Approved 1.0.7 beta deployment — October 5, 2026

- User explicitly approved v1.0.7. Pre-deployment syntax, seven content/date tests, site integrity, version synchronization, and Hosting-only scope checks passed.
- Deployed Hosting only to staging target test-blackstoneward in project blackstoneward-b861c. All 17 public files finalized and released successfully.
- Published browser confirmed the new horizontal logo loads at 340 × 131px on desktop and the exact Ward Hub introductory sentence appears beneath Welcome home. Footer displays v1.0.7; existing calendar times and conference announcement render correctly.
- Verified responsive widths: desktop 1031px, tablet 900px, and mobile 390px/320px. No horizontal overflow or logo/navigation overlap. Tablet navigation sits beneath the logo. At 390px mobile, logo measures 234 × 90px and the Menu button wraps below it; its dropdown opens below the header and closes after navigation. At 320px the logo is 164px wide and remains within the page.
- Browser console contained no errors or warnings. Saved published desktop/mobile screenshots in the chat workspace output directory, reset the temporary viewport, and left the beta homepage open.
- Deployment documentation retains the approved v1.0.7 identifier. Production, DNS, Firestore records/rules, Cloud Functions, and Youth Hub migration remain unchanged. No local server or headless browser subagent used.

## 1.0.8 mobile organization tiles — October 5, 2026

- At widths up to 760px, Youth Hub spans both grid columns in the first row. Bishopric, Elders Quorum, Relief Society, and Sunday School fill two equal-height rows of two equal-width tiles.
- Removed Sunday School's mobile full-row treatment. Reduced the four organization tiles' padding, heading/icon sizes, and minimum height to 140px. Equal fractional rows allow their content to grow without clipping while keeping all four tile heights matched.
- Youth Hub retains its existing typography/icon prominence with a 128px minimum height. Desktop organization layout is unchanged.
- Synchronized package, lockfile, content, footer fallback, and CSS/module URL versions to 1.0.8. Syntax, seven existing content/date tests, site integrity, version synchronization, and CSS parsing checks passed. Published mobile layout review remains pending approval.
- No deployment, local server, browser subagent, production/database changes, GitHub push, or Youth Hub migration performed.

## Approved 1.0.9 beta deployment — October 6, 2026

- User explicitly approved v1.0.9. Pre-deployment syntax, seven existing content/date tests, site integrity/version synchronization, and Hosting-only scope checks passed.
- Deployed Hosting only to staging target test-blackstoneward in project blackstoneward-b861c; all 17 public files finalized and released successfully.
- Published browser verification confirmed heading colour rgb(85, 86, 91), equivalent to #55565B; footer v1.0.9; and successful loading of the horizontal ward logo. Visually inspected the grey heading beside the logo in the published desktop screenshot.
- Browser console contained no errors or warnings. Saved the screenshot to the chat workspace output directory and left beta open for review.
- Deployment-only documentation retains v1.0.9. Production, DNS, Firestore records/rules, Cloud Functions, GitHub, and Youth Hub migration remain unchanged. No local server or browser subagent used.

## Approved 1.0.8 beta deployment — October 5, 2026

- User explicitly approved v1.0.8. Syntax, seven content/date tests, site integrity, matching versions, and Hosting-only scope checks passed before deployment.
- Deployed Hosting only to staging target test-blackstoneward in project blackstoneward-b861c; all 17 public files finalized and released successfully.
- Verified published footer v1.0.8 and mobile organization layout. At 390px viewport, Youth Hub spans the 335px grid width; each of the other four cards measures 161.5 × 140px, arranged in two rows of two.
- At 320px viewport, Youth Hub spans the 265px grid width; the other four measure 126.5 × 154.0625px. Cards grow equally for wrapped text; no clipping or horizontal overflow detected at either mobile width.
- Verified desktop remains five equal-width cards on one row. Browser console contained no errors or warnings.
- Visually inspected the published mobile screenshot saved in the chat workspace output directory. Reset the temporary viewport and left beta open for review.
- Deployment-only documentation retains v1.0.8. Production, DNS, Firestore records/rules, Cloud Functions, GitHub, and Youth Hub migration remain unchanged. No local server or browser subagent used.

## Resume note — October 6, 2026

- User asked to save the deployment-configuration finding for tomorrow and stop work for today.
- Before migration, confirm the actual production Hosting site/target: both Youth/Website-beta/.firebaserc and Youth/Website/.firebaserc currently map staging to test-blackstoneward in project blackstoneward-b861c. The folder named Website does not by itself confirm a production deployment target.
- Local files in both Website-beta and Website are readable. This was a read-only inspection; neither existing site workspace was changed.
- The new ward homepage remains v1.0.8 on test.blackstoneward.org. Website-New is not a Git repository, and no homepage changes have been pushed to GitHub.
- Production deployment, Youth Hub migration, and GitHub setup remain future work; no further actions or automatic deployment are scheduled. This is a saved handoff note, with no website version change.

## 1.0.9 welcome heading colour — October 6, 2026

- Changed only the Welcome home heading colour to charcoal grey #55565B, giving the darker Blackstone Ward logo stronger visual emphasis. The scoped #welcome-title rule applies to desktop/mobile and all four seasons.
- Synchronized package, lockfile, content, footer fallback, and CSS/module URL versions to 1.0.9.
- Existing syntax, seven content/date tests, site integrity/version checks, and CSS parsing passed. No Tailwind class changes or rebuild needed. Published colour review remains pending beta deployment approval.
- No deployment, local server, browser subagent, production/database changes, GitHub push, or Youth Hub migration performed.

## 1.0.10 lighter welcome heading — October 6, 2026

- Replaced the Welcome home heading's charcoal grey with the exact user-requested light grey #D3D3D3. The scoped heading rule applies across desktop/mobile and all seasons; no other styling or content changed.
- Synchronized package, lockfile, content, footer fallback, and CSS/module URL versions to 1.0.10.
- Syntax, seven existing content/date tests, site integrity/version synchronization, and CSS parsing passed. No Tailwind rebuild needed. Published review awaits beta deployment approval.
- No deployment, local server, browser subagent, production/database changes, GitHub push, or Youth Hub migration performed.

## Approved 1.0.10 beta deployment — October 6, 2026

- User explicitly approved v1.0.10. Syntax, seven existing content/date tests, site integrity/version synchronization, and Hosting-only scope checks passed before deployment.
- Deployed Hosting only to staging target test-blackstoneward in project blackstoneward-b861c. All 17 public files finalized and released successfully.
- Published browser verified Welcome home colour rgb(211, 211, 211), equivalent to #D3D3D3; footer v1.0.10; and successful ward-logo loading. Console contained no errors or warnings.
- Saved and visually inspected the published desktop screenshot in the chat workspace output directory. Left beta homepage open for review.
- Deployment-only documentation retains v1.0.10. Production, DNS, Firestore records/rules, Cloud Functions, GitHub, and Youth Hub migration remain unchanged. No local server or browser subagent used.

## 1.0.11 medium-grey welcome heading — October 6, 2026

- Replaced Welcome home's light grey #D3D3D3 with the exact user-requested #808080. The scoped heading rule applies across desktop/mobile and all seasons; no other styling or content changed.
- Synchronized package, lockfile, content, footer fallback, and CSS/module URL versions to 1.0.11.
- Existing syntax, seven content/date tests, site integrity/version checks, and CSS parsing passed. No Tailwind rebuild needed. Published review awaits beta deployment approval.
- No deployment, local server, browser subagent, production/database changes, GitHub push, or Youth Hub migration performed.

## Approved 1.0.11 beta deployment — October 6, 2026

- User explicitly approved v1.0.11. Syntax, seven existing content/date tests, site integrity/version synchronization, and Hosting-only scope checks passed before deployment.
- Deployed Hosting only to staging target test-blackstoneward in project blackstoneward-b861c. All 17 public files finalized and released successfully.
- Published browser verified Welcome home colour rgb(128, 128, 128), equivalent to #808080; content-loaded footer v1.0.11; and successful ward-logo loading. Content status is hidden; console contained no errors or warnings.
- Saved and visually inspected the published desktop screenshot in the chat workspace output directory. Left the beta homepage open for review.
- Deployment-only documentation retains v1.0.11. Production, DNS, Firestore records/rules, Cloud Functions, GitHub, and Youth Hub migration remain unchanged. No local server or browser subagent used.
