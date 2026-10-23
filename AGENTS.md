# Operational Rules & Standing Instructions

These standing rules are derived directly from `AG_Best_Practices.md` and govern all agent operations in this repository.

## 1. Strict File Fence (Scope Lock)
- **Scope Lock**: The agent is expressly forbidden from altering any file, line of code, or logic block that is not explicitly named in the Mission Objective or directly required to resolve the immediate task.
- **No Unprompted Refactoring**: Never "clean up," refactor, or modernize code that falls outside the exact scope of the mission. Existing variables, comments, and adjacent logic must be preserved exactly as they are found.
- **Approved Editing Tools**: Source changes may be made using Codex built-in file-editing tools (including apply_patch) or a native code editor. Terminal commands or scripts that rewrite source files, including sed, awk, echo, or ad hoc file-writing scripts, are forbidden. Standard dependency installation, build output generation, asset rendering for checks, and requested file copying are allowed within the task scope.

## 2. Autonomous Versioning & Documentation
- **Version Management**: The agent manages decimal version increments (Patch, Minor, Major) based on the human operator's defined level of update.
- **Visible Website Version**: After every website update, increment the version using the Patch, Minor, or Major parameters above and update the bottom-right footer version. Keep `package.json`, the root entries in `package-lock.json`, `public/data/ward.json`, and the fallback `#footer-version` in `public/index.html` synchronized. The rendered footer reads the content version; `npm run check` must confirm these values match before reporting code complete.
- **Release Asset Versions**: Keep the CSS/module `?v=` URLs in `public/index.html` and the content-module import in `public/js/home.js` synchronized with the website version. These URLs prevent a new layout from running cached older scripts; `npm run check` must confirm they match.
- **Documentation**: Every completed mission must conclude with updates to `PROJECT_STATE.md` and `CHANGELOG.md` reflecting the new version number and detailing the specific changes made.

## 3. Beta-First Execution
- **Development Workspace**: This ward-homepage project is developed in `Website-New/`, as explicitly selected by the user. The existing Youth Hub remains in its own workspace.
- **Beta-First Deployment**: All new features, bug fixes, and architectural changes must be deployed to `test.blackstoneward.org` first, after the approval checkpoint below. Production deployment and Youth Hub migration require separate explicit approval. Direct production edits are forbidden.

## 4. Code First, Deploy Second (Approval Gate)
- **No Local Bot Verification**: Do not launch local servers (`python3 -m http.server`, etc.) or utilize a headless browser subagent to verify work unless explicitly commanded.
- **Workflow**:
  1. Write the code locally.
  2. Stop and report: `"Code Complete. Awaiting deployment approval."`
  3. Wait for the human operator to test and explicitly reply `"Approved"`.
  4. Only execute deployment (e.g., `firebase deploy --only hosting:staging`) after receiving explicit approval.

## 5. Shared Database Warning (Firestore Bleed Risk)
- **Shared Instance**: The Beta and Production environments share the exact same Firestore instance (`blackstoneward-b861c`).
- **No Destructive Testing**: Never run broad "Delete All" scripts in Beta, as they will wipe live production data.
- **Security Rule Bleed**: Any `firestore.rules` deployed from Beta instantly apply to the live Production site. Proceed with extreme caution.

## 6. Automated GitHub Push Protocol
- **Authenticated Push**: GitHub authentication is securely handled via the system-authenticated GitHub CLI (`gh`) and macOS Keychain on this machine.
- **Direct Push**: When instructed to push to GitHub (e.g., *"commit and push to GitHub"*), the agent stages, commits with the synchronized version number, and pushes directly to `origin main` on `https://github.com/tueini/Blackstone-Ward-Homepage`.
- **Zero Air Gap Required**: No manual Personal Access Tokens or external terminal operations are required from the human operator.

