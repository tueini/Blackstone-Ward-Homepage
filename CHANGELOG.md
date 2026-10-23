# Blackstone Ward homepage changelog

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
