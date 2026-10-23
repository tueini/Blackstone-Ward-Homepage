# Blackstone Ward homepage

Version 1.0.18 · October 6, 2026 · Approved and deployed to beta; published schedule-label review passed: https://test.blackstoneward.org/

The approved one-page ward homepage, built in Website-New at the user's direction. The existing Youth Hub and production website are unchanged.

The header logo uses public/assets/ward-logo-horizontal-v1.0.6.png, generated with built-in ImageGen from the original portrait logo. Its larger two-line wordmark sits to the right of the steeple. The exact generation prompt is saved in zzdesignfiles/ward-logo-horizontal-prompt-v1.0.6.txt; the original logo remains available.

## Review

Review the published beta at https://test.blackstoneward.org/. The site is in `public/index.html` locally. It is plain HTML, compiled Tailwind CSS, custom seasonal CSS, and small JavaScript ES modules. No local server was launched by the agent. Opening the HTML as a local file can block its ES modules and JSON content; the published beta supports both for interactive review.

Append `?preview=1` to the homepage URL to reveal the seasonal review toolbar. Append `?preview=1&season=winter` (or fall/spring/summer) for a specific initial theme. The toolbar is hidden on the normal homepage. In `public/data/ward.json`, `season` is `auto` by default and can be set to any season manually. Automatic boundaries use Massachusetts calendar months: winter Dec–Feb, spring Mar–May, summer Jun–Aug, fall Sep–Nov.

On desktop, the scenic hero and Youth Hub band hold their backgrounds fixed while the page scrolls over them, matching the auction site. This desktop CSS parallax also works when local-file restrictions block ES modules. Small screens use gentler motion, a Menu button, two-column organization cards, and stacked announcement/event panels. Reduced-motion preferences stop the parallax and smooth scrolling.

Version 1.0.14 removes branch sway, the WebGL renderer, and the animation pause control. There are no falling particles. The user explicitly requested keeping the original scrolling parallax, which remains on desktop and mobile with reduced-motion support. Seasonal PNGs and theme selection stay in place. Published desktop and 390px mobile checks confirmed removal and retained parallax. Reload an existing homepage/preview tab if it still shows an older effect: cached older HTML can otherwise load an older script while the content footer already shows the current version.

## Ward content

The bottom welcome/services section and centered footer follow the user's October 6 screenshot. The five-row weekly schedule is a semantic two-column table, with responsive type and wrapping on narrow screens. `worship.meetinghouseName`, `worship.postalCode`, and `worship.weeklySchedule` (rows with `name` and `when`) hold the new public details. The screenshot's old version is replaced by the current release number. In v1.0.16, bottom non-heading text matches the Youth Hub description at 16px desktop and 15px mobile, with larger headings preserved. Published desktop and 390px mobile checks confirmed these sizes, all five rows, and no horizontal overflow or captured console errors/warnings.

Edit `public/data/ward.json` to supply approved public information. No private youth information is copied into this site. Ward content now includes the supplied General Conference announcement and three October 2026 events. This build reads the local JSON file, not Firestore. A future Firebase content connection needs explicitly chosen collections and corresponding read permissions; the shared live database was not changed.

Version 1.0.17 places the weekly heading and table in one centered content-width block. Service names align with the heading's left edge, while times remain left aligned with 32px desktop / 20px mobile separation. The block is capped at the available width for narrow screens. Published desktop and 390px review confirmed the column alignment and spacing; a 320px check also confirmed alignment without horizontal overflow.

Version 1.0.18 changes the Sunday 01:35 PM schedule label to Youth/EQ/RS in both public JSON and the HTML fallback. Published beta review confirmed the corrected label and v1.0.18 script/footer.

- `worship.time` and `worship.address` contain the user-confirmed `12:00 PM` and `91 Jordan Road, Franklin MA`.
- Set `contact.email` to one public email address, or `contact.url` to an HTTPS contact page. The homepage opens that destination directly; it does not send messages.
- Events need `title`, `published` (boolean), and `startAt`. Optional fields are `endAt`, `location`, `details`, `url`, and `linkLabel`.
- The three October 2026 events have confirmed Eastern start times of 7 PM, 7 PM, and 5 PM in date order. End times remain unspecified; without an `endAt`, upcoming entries disappear after their start time.
- Events supplied without a start time use `allDay: true` for date-only display, with Eastern midnight/end-of-day timestamps for filtering. These boundaries do not imply that the activity lasts all day. Replace them with confirmed start/end times and remove `allDay` when times are supplied.
- Announcements need `title` and `published` (boolean). Optional fields are `body`, `pinned`, `url`, and `linkLabel`.
- Both support optional `publishAt` and `expiresAt`. All timestamps must contain an explicit UTC offset, such as `2026-10-14T19:00:00-04:00`, or `Z`. Use the correct offset for the date. Expired/draft/future content is excluded. Ongoing events remain visible until their end time. Dates display in America/New_York.
- Content is rendered as text. HTML in announcement text is not executed; links must use HTTPS.

Example event (illustration only; not installed as a real activity):

```json
{
  "title": "Example ward activity",
  "published": false,
  "startAt": "2026-10-14T19:00:00-04:00",
  "endAt": "2026-10-14T20:00:00-04:00",
  "location": "Confirmed public location",
  "details": "Approved public details"
}
```

## Organization destinations

Youth links currently open the existing `https://blackstoneward.org/` Youth Hub. After its separate migration is verified, set `youth.ready` to `true` so both links open `https://youth.blackstoneward.org/`. The link logic prevents a root homepage self-loop if the new root is launched before migration, but the migration must still be completed before production release.

The remaining organization URLs are configured but inactive until their `ready` flags are true:

| Organization | Destination |
| --- | --- |
| Bishopric | https://bish.blackstoneward.org/ |
| Elders Quorum | https://eq.blackstoneward.org/ |
| Relief Society | https://rs.blackstoneward.org/ |
| Sunday School | https://ss.blackstoneward.org/ |

## Build and checks

```text
npm ci --ignore-scripts
npm run build
npm run check
```

The generated `public/assets/tailwind.css` is included. Node is needed only to rebuild/check; the published homepage has no Node runtime. Tailwind uses the [official CLI workflow](https://tailwindcss.com/docs/installation/tailwind-cli), compiling CSS locally instead of loading a runtime CDN.

After each website update, synchronize the version in the package manifest, lockfile root entries, public ward content, HTML footer fallback, CSS/module asset URL query parameters, and project documentation as required by AGENTS.md. The bottom-right footer displays that version; the integrity check rejects mismatched versions. Versioned code assets prevent a new layout from running cached older scripts.

## Deployment checkpoint

AGENTS.md follows the workflow approved by the user: Codex built-in file-editing tools or native editors may change scoped source files; terminal source rewrites remain forbidden. Website-New is the designated development workspace. Beta-first deployment to test.blackstoneward.org, the explicit approval checkpoint, and shared-database protections remain in force.

`firebase.json` contains Hosting only; it cannot deploy Firestore rules or Cloud Functions. `.firebaserc` maps the staging target to the existing `test-blackstoneward` Hosting site in project `blackstoneward-b861c`, matching the beta configuration. The user explicitly approved version 1.0.11, which is now deployed at **test.blackstoneward.org**. Production was unchanged. Future deployments still require the same explicit approval checkpoint.

Version 1.0.4 passed published desktop/mobile browser checks for its new content, footer version, and navigation. Continue reviewing all four themes, reduced motion, keyboard navigation, and links on beta before any production migration. Public contact details and event end times remain unconfirmed. The draft remains `noindex, nofollow`; remove that meta tag only for the approved production release.

Production release is a later step: verify/move the Youth Hub to its subdomain; review old route redirects and hosting targets; then publish the ward homepage at the root. DNS, Youth Hub migration, production deployment, administration, and Firestore changes are not part of this local build.
