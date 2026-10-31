---
name: tithing-declaration-sync
description: >-
  Re-sources and updates the Blackstone Ward Tithing Declaration page (/td)
  from the Bishopric Tithing Declaration Excel workbook (Blackstone-Tithing-Declaration-Schedule-2026.xlsx).
  Use this skill whenever the user updates the Tithing Declaration Excel spreadsheet or asks to refresh,
  re-source, or update blackstoneward.org/td.
---

# Tithing Declaration Schedule Sync (`/td`)

This skill synchronizes the Sunday tabs from the Blackstone Ward Tithing Declaration Excel workbook into `public/data/tithing-declaration.json` and the embedded fallback dataset in `public/td/index.html`.

## Standing Rules for Tithing Declaration Sync

1. **Never Source the Summary Tab**: The `Summary` worksheet tab (and any empty pre-November template tabs) must always be excluded. Only the Sunday interview tabs (November through the first Sunday in December) are sourced.
2. **Routing & Notification**: Every family slot on `/td` must remain clickable to open the schedule change request modal, which routes change requests to `mcdonaldlds830@gmail.com` with `CC: duanepharris@gmail.com`.
3. **Version & Approval Gate**: Follow `AGENTS.md` standing rules—increment the website version across `package.json`, `package-lock.json`, `public/data/ward.json`, `public/index.html`, `public/js/home.js`, `PROJECT_STATE.md`, and `CHANGELOG.md`, run `npm run check`, and wait for `"Approved"` before deploying.

## Step-by-Step Workflow

1. **Run the Excel Sync Script**:
   Execute [sync_td_schedule.py](./scripts/sync_td_schedule.py) (note: reading the `.xlsx` outside the repository folder requires `BypassSandbox: true` if the file is located in `/Users/dharris/Documents/0Church/Blackstone_Ward/Bishopric/Tithing_Declaration/2026/`):
   ```sh
   python3 .agents/skills/tithing-declaration-sync/scripts/sync_td_schedule.py
   ```
   Or pass a custom `.xlsx` path if the user supplies a new file location:
   ```sh
   python3 .agents/skills/tithing-declaration-sync/scripts/sync_td_schedule.py "/path/to/Blackstone-Tithing-Declaration-Schedule-2026.xlsx"
   ```

2. **Verify Generated Output**:
   - Confirm `public/data/tithing-declaration.json` and the `<!-- TD_DATA_START -->` block in `public/td/index.html` updated cleanly.
   - Verify the script output reports the expected number of Sunday tabs and scheduled households (with `Summary` excluded).

3. **Synchronize Version & Run Site Checks**:
   - Increment the patch version in `package.json`, `package-lock.json`, `public/data/ward.json`, `public/index.html`, `public/js/home.js`, and `public/td/index.html`.
   - Update `PROJECT_STATE.md` and `CHANGELOG.md`.
   - Run:
     ```sh
     npm run build && npm run check
     ```

4. **Stop at the Approval Gate**:
   - Report `"Code Complete. Awaiting deployment approval."` before running `firebase deploy --only hosting:staging`.

