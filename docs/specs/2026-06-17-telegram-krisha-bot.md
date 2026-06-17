# Telegram Krisha Search Bot

## Goal

Build a Telegram bot that accepts real estate search requests in Russian, converts them into structured Krisha.kz search parameters, runs safe listing searches through a Netlify-compatible backend, and returns concise result lists back to Telegram.

The project should reuse the old parser project's stable reference data and task/storage ideas, while avoiding account-risky automation such as anti-bot evasion, CAPTCHA bypassing, stealth browsing, or automated phone reveal flows.

## Users And Scenarios

Primary user: the project owner, using Telegram from a phone or desktop.

Scenario 1: Search land plots for sale.
The user sends a request such as "дай участки на продажу в Алматы до 30 млн". The bot extracts category, geography, deal type, price filters, creates a search task, and replies with matching listings or a queued status if the search takes longer than a Telegram webhook response should.

Scenario 2: Search apartments with filters.
The user sends a request such as "квартиры на продажу в Астане, 2-3 комнаты, до 60 млн". The bot maps the request to Krisha category and `das[...]` filters, builds the search URL, fetches public listing cards, deduplicates results, and sends a short list with title, price, location, URL, and parsed metadata when available.

Scenario 3: Check task status.
The user can ask for recent tasks or repeat the last search. The bot reads saved task/result state and replies with current status and latest results.

Scenario 4: Admin-only access.
Only approved Telegram chat IDs can use the bot. Unknown users get a short rejection response and no backend task is created.

## In Scope

- Netlify-compatible Telegram webhook endpoint.
- Telegram message verification using the bot token and an allowlist of Telegram chat IDs.
- Structured command parser for the MVP using deterministic Russian patterns and simple keyword matching.
- Reuse of old Krisha reference files:
  - `docs/krisha-kz-parser-main/docs/krisha-reference/geo.json`
  - `docs/krisha-kz-parser-main/docs/krisha-reference/categories.json`
  - `docs/krisha-kz-parser-main/docs/krisha-reference/filters.json`
- URL builder for supported Krisha categories and `das[...]` filters.
- Public listing result extraction for search result pages, limited to safe metadata visible without logging in.
- Task/result persistence in an external Netlify-compatible database or storage service.
- A small result format suitable for Telegram messages.
- Netlify deployment configuration.
- Tests for parsing, URL building, task creation, and mocked listing extraction.

## Out Of Scope

- Automated login to Krisha.kz.
- Storing or using the user's Krisha.kz login/password in this MVP.
- CAPTCHA solving, 2captcha, reCAPTCHA bypassing, stealth browser behavior, or "human imitation" to evade detection.
- Phone number reveal or scraping private/contact data.
- Proxy rotation or IP/geolocation evasion.
- Continuous 24/7 worker process inside Netlify.
- Large-scale crawling of Krisha.kz.
- A web dashboard UI.
- Full natural-language understanding. The MVP supports practical deterministic phrases and can ask for missing fields.

## Constraints

- Deploy to Netlify by default.
- Netlify Functions are event-driven and short-lived, so the app must not rely on a permanent in-process scheduler.
- Long searches must be chunked, queued, or run through Netlify background functions, with results stored externally.
- Keep request volume low. The MVP should fetch only the first page by default unless the user explicitly asks for more.
- Secrets must stay in Netlify environment variables or the chosen managed secrets mechanism, never committed to the repository.
- The current repository is mostly empty and contains the old project under `docs/krisha-kz-parser-main`; the new app should be created at the repository root.
- The old Python/Docker design is a reference source, not the deployment target.

## Acceptance Criteria

- A Telegram webhook endpoint on Netlify can receive a Telegram update and return a valid response.
- An allowlisted Telegram user can ask for supported searches in Russian:
  - land plots for sale by city or region
  - apartments for sale by city or region
  - optional price range
  - optional room count for apartments
- The bot maps supported requests to a Krisha search URL using the local reference JSON files.
- The bot returns at least title/price/location/link for found public listings when the page shape supports it.
- The bot stores created tasks and deduplicated listing results in a Netlify-compatible persistence layer.
- Unknown users cannot create tasks.
- The codebase includes Netlify config and can run locally with Netlify Dev or a documented local command.
- Tests cover command parsing, URL generation, authorization, and mocked result extraction.
- No implementation includes CAPTCHA solving, anti-bot evasion, automated Krisha login, or phone reveal behavior.
