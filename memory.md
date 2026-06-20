# Project Memory

## 2026-06-17 Session Close

### Session Goal

Finish the repository session end to end: publish the project to GitHub, verify the current state, prepare release bookkeeping, and deploy to Netlify.

### Changes Made

- Created the public GitHub repository `tolegeen9909-commits/krisha-bot`.
- Added `origin` as `https://github.com/tolegeen9909-commits/krisha-bot.git`.
- Created and pushed the initial project commit `5f73899`.
- Hardened `.gitignore` so local secrets, caches, generated Netlify folders, zip archives, logs, and local Krisha session cookie files stay out of git.
- Installed GitHub CLI (`gh`) on the Mac and verified authentication for `tolegeen9909-commits`.
- Confirmed the Netlify project link for `krisha-telegram-bot`.

### Decisions

- The GitHub repository was created as public because the user explicitly requested public access.
- Direct pushes to `main` remain avoided during `finish`; session-close bookkeeping is handled through a Codex branch and PR.
- Project secrets stay in local `.env` files or Netlify environment variables and are not committed.
- Netlify remains the default deployment target for this project.

### Lessons Learned

- `gh` was initially missing, so repository creation required installing GitHub CLI via Homebrew.
- `npx netlify status` failed with the default npm cache because `~/.npm` contains root-owned files; using the project-local `.npm-cache` via `npm_config_cache=.npm-cache` avoids that local permission issue.
- The GitHub connector can read repository metadata, but `gh` is the reliable path for creating repositories from this Mac.

### Verification

- `npm test` passed: 14 test files, 77 tests.
- `npm run typecheck` passed.
- `npm run build` passed.
- `gh auth status` confirmed login to GitHub as `tolegeen9909-commits`.
- `gh repo view --json nameWithOwner,url,visibility,defaultBranchRef` confirmed the repo is public and uses `main`.
- `npm_config_cache=.npm-cache npx netlify status` confirmed the project is linked to Netlify site `krisha-telegram-bot`.
- `npm_config_cache=.npm-cache npx netlify deploy --prod` completed successfully.
- Browser verification confirmed the production page title and H1 are `Krisha Telegram Bot`.
- `curl https://krisha-telegram-bot.netlify.app/api/health` returned HTTP 200 with `ok: true`.

### Links

- GitHub repository: https://github.com/tolegeen9909-commits/krisha-bot
- Netlify site: https://krisha-telegram-bot.netlify.app
- PR: https://github.com/tolegeen9909-commits/krisha-bot/pull/1
- Deploy: https://krisha-telegram-bot.netlify.app

### Remaining Work

- Confirm all required production environment variables are configured in Netlify before using the Telegram bot in production.
- Keep future feature work on non-main branches and merge through PRs.

### Risks

- Runtime Telegram, OpenAI, and scheduled alert features depend on production environment variables.
- The local global npm cache has permission issues; use `npm_config_cache=.npm-cache` for Netlify CLI commands until `~/.npm` ownership is repaired.

## 2026-06-20 Session Close

### Session Goal

Fix saved-search behavior so the Telegram bot does not resend old Krisha listings as new, and make saved-search notifications manual-only unless the user explicitly asks the bot to check.

### Changes Made

- Fixed saved-search duplicate detection by treating both `sentAdvertIds` and saved listing history as already seen.
- Kept price-drop alerts intentional: old listings can still be sent when the saved price drops, but the message is labeled as an update instead of a new listing.
- Changed saved-search alert title from "Новые объявления" to "Обновления по поиску".
- Removed the scheduled Netlify function that checked saved searches every 30 minutes.
- Added Telegram command handling for "проверь мои поиски" and related phrases.
- Manual saved-search checks now run only for the requesting chat's active searches.
- Kept reminder scheduling enabled so time-based reminders still arrive automatically.
- Updated help and saved-search messages to explain that auto search notifications are off.
- Added regression tests for old listings in history and manual saved-search command/messages.

### Decisions

- Saved searches remain useful as stored filters, but they no longer run automatically.
- User-triggered search checks are the default workflow to avoid daily/unwanted notifications.
- The protected `/api/check-saved-searches` endpoint remains available for manual/admin use, but the public scheduled function was removed.
- Reminder notifications stay scheduled because their purpose is to notify at a specific requested time.

### Lessons Learned

- A listing can be present in saved history but missing from `sentAdvertIds`, so dedupe must consider both sources.
- Message wording matters: "new" is misleading when an update is caused by a price drop on an older listing.
- Netlify function bundling clearly shows whether scheduled search checks are still deployed; after the change, the scheduled saved-search function is no longer included.

### Verification

- `npm run typecheck` passed.
- `npm test -- --run` passed: 14 test files, 80 tests.
- `npm run build` passed.
- `npm audit --audit-level=high --cache .npm-cache` passed with 0 vulnerabilities.
- `npx --cache .npm-cache netlify deploy --prod --build` completed successfully before finish.
- `curl https://krisha-telegram-bot.netlify.app/api/health` returned `ok: true`.
- Manual execution of saved-search checks was intentionally not triggered from Codex to avoid sending real Telegram messages.

### Links

- PR: https://github.com/tolegeen9909-commits/krisha-bot/pull/3
- Netlify site: https://krisha-telegram-bot.netlify.app
- Pre-finish production deploy: https://6a36bc84e477f8c65058352b--krisha-telegram-bot.netlify.app

### Remaining Work

- Test the command "проверь мои поиски" directly in Telegram when ready.
- Decide later whether to add a per-search toggle for automatic monitoring, if the workflow needs both manual and automatic modes.

### Risks

- Manual saved-search checks can still send Telegram updates immediately when the user asks for them.
- Runtime search behavior depends on Krisha public page structure and Netlify environment variables.
- The local global npm cache still has permission issues; using the project-local `.npm-cache` remains the reliable Netlify CLI path.
