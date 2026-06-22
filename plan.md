# Plan: Telegram Krisha Search Bot

**Spec:** [docs/specs/2026-06-17-telegram-krisha-bot.md](docs/specs/2026-06-17-telegram-krisha-bot.md)
**Status:** [x] Gate 4 - implemented, deployed to Netlify, and Telegram webhook connected

## Architecture And Data Flow

```
Telegram user
  -> Telegram Bot API webhook
  -> Netlify Function: POST /api/telegram
      -> verify Telegram secret token and allowlisted chat id
      -> parse Russian request into SearchIntent
      -> resolve category/geo/filter values from local Krisha reference JSON
      -> build Krisha public search URL
      -> create Task in Netlify Blobs
      -> fetch one public search result page
      -> extract public listing cards only
      -> dedupe and store Result in Netlify Blobs
      -> send Telegram message with concise results

Optional follow-up:
Telegram user asks "еще" or "статус"
  -> /api/telegram
      -> read previous task/results from Netlify Blobs
      -> return latest stored results or queued status
```

MVP uses Netlify Functions with TypeScript, modern `default export + config` handlers, and Netlify Blobs for low-volume task/result storage. This keeps deployment simple and avoids a permanent worker process. The storage layer will be wrapped so it can later move to Neon/Supabase Postgres if task volume grows.

The app will not automate Krisha login, reveal phone numbers, solve CAPTCHA, rotate proxies, or add stealth/browser evasion behavior.

## Files To Create Or Modify

- `package.json` - scripts, runtime dependencies, dev dependencies.
- `package-lock.json` - generated during implementation.
- `tsconfig.json` - strict TypeScript settings with JSON imports.
- `netlify.toml` - build command, function directory, local dev settings.
- `.gitignore` - Node/Netlify/local env ignores.
- `.env.example` - non-secret variable names and setup notes.
- `README.md` - local setup, Telegram webhook setup, Netlify deploy notes.
- `src/reference/krisha/geo.json` - copied from old project's Krisha reference data.
- `src/reference/krisha/categories.json` - copied from old project's Krisha reference data.
- `src/reference/krisha/filters.json` - copied from old project's Krisha reference data.
- `src/krisha/reference.ts` - typed loaders and lookup helpers for local reference JSON.
- `src/krisha/aliases.ts` - Russian aliases for common city/region names and category words.
- `src/krisha/urlBuilder.ts` - build Krisha URL from structured filters.
- `src/krisha/listingExtractor.ts` - parse public listing cards from search HTML.
- `src/bot/commandParser.ts` - deterministic Russian MVP parser.
- `src/bot/messages.ts` - Telegram-safe response formatting.
- `src/storage/types.ts` - `Task`, `ListingResult`, and storage DTO types.
- `src/storage/blobStore.ts` - Netlify Blobs persistence wrapper.
- `src/shared/config.ts` - environment variable reading and validation.
- `src/shared/http.ts` - small HTTP helpers and JSON responses.
- `src/shared/errors.ts` - typed user-facing error helpers.
- `netlify/functions/telegram.ts` - Telegram webhook endpoint.
- `netlify/functions/health.ts` - simple health/config check without secrets.
- `tests/*.test.ts` - parser, URL builder, auth, listing extractor, storage mock tests.

## MVP

- Support these request families:
  - `участки на продажу в <город/область>`
  - `квартиры на продажу в <город/область>`
  - price: `до 30 млн`, `от 20 млн до 60 млн`, raw tenge numbers
  - rooms for apartments: `1 комн`, `2-3 комнаты`, `3+`
- Fetch only page 1 by default.
- Return up to 5 listings per Telegram response.
- Store each task by task id and remember the last task per Telegram chat id.
- Require `TELEGRAM_ALLOWED_CHAT_IDS`.
- Use Telegram `X-Telegram-Bot-Api-Secret-Token` when `TELEGRAM_WEBHOOK_SECRET` is set.
- Use public listing fields only: title, price, location, URL, and optional summary text.

## Later Work

- More pages via explicit "еще" command and a page cursor.
- Background function for multi-page searches when the user asks for broader scans.
- Better NLP with a model or classifier after deterministic MVP is stable.
- Postgres persistence through Neon/Supabase if Netlify Blobs becomes too limited.
- Admin commands for saved searches, scheduled reminders, and export.
- A small read-only web dashboard if needed.

## Implementation Checklist

- [x] Scaffold Node/TypeScript/Netlify project files.
- [x] Copy Krisha reference JSON into `src/reference/krisha/`.
- [x] Implement config validation for Telegram token, allowed chat IDs, and webhook secret.
- [x] Implement Telegram authorization helpers.
- [x] Implement Russian command parser for the MVP phrases.
- [x] Implement Krisha geo/category lookup and alias resolution.
- [x] Implement URL builder for supported `das[...]` filters.
- [x] Implement public listing extraction with fixture-based tests.
- [x] Implement Netlify Blobs storage wrapper.
- [x] Implement `/api/telegram` function.
- [x] Implement `/api/health` function.
- [x] Add README and environment setup instructions.
- [x] Add unit tests for parser, URL builder, auth, and extractor.
- [x] Run typecheck, tests, and build locally.
- [ ] Run Netlify Dev smoke test. *(blocked locally: Netlify CLI starts then exits with `EMFILE: too many open files, watch`; function handlers covered by tests)*
- [x] Prepare Netlify deployment flow.
- [x] Create Netlify project `krisha-telegram-bot`.
- [x] Deploy production site: `https://krisha-telegram-bot.netlify.app`.
- [x] Configure Netlify environment variables.
- [x] Connect Telegram webhook to `/api/telegram`.
- [x] Production smoke test: `/api/health` and mock Telegram webhook request passed.

## Feature: Long-Listed Sorting

**Spec:** [docs/specs/2026-06-17-long-listed-sort.md](docs/specs/2026-06-17-long-listed-sort.md)

- [x] Detect "oldest first" phrases in Russian requests.
- [x] Extract public listing date text and sortable timestamps.
- [x] Sort fetched listings old-first when requested.
- [x] Show listing date text in Telegram replies.
- [x] Add tests and redeploy to Netlify.

## Feature: Saved Search Alerts

**Spec:** [docs/specs/2026-06-17-saved-search-alerts.md](docs/specs/2026-06-17-saved-search-alerts.md)
**Status:** [x] Gate 4 - implemented, deployed, and smoke-tested

### Architecture And Data Flow

```
Telegram user
  -> "следи за квартиры Алматы до 60 млн"
  -> /api/telegram
      -> parse as saved-search command
      -> reuse existing SearchIntent parser
      -> build Krisha URL
      -> create SavedSearch in Netlify Blobs
      -> run one initial public fetch
      -> store seen advert ids
      -> reply with saved search id and first listings

Netlify Scheduled Function
  -> /netlify/functions/check-saved-searches
      -> load active saved searches from Netlify Blobs
      -> fetch first public Krisha page for each search
      -> extract listing cards
      -> filter out already seen advert ids
      -> update seen advert ids and last checked time
      -> send Telegram messages for new listings
```

The scheduled function will be conservative: process a small capped number of active searches per run, fetch only the first public page, and send only a few new listings per search.

### Files To Create Or Modify

- `src/storage/types.ts` - add `SavedSearch`, `SavedSearchStatus`, and saved-search DTOs.
- `src/storage/blobStore.ts` - add saved-search CRUD, listing/index keys, and dedupe helpers.
- `src/bot/types.ts` - add `save_search`, `list_searches`, and `stop_search` command variants.
- `src/bot/commandParser.ts` - detect `следи за`, `сохрани поиск`, `мои поиски`, `останови поиск <id>`, `удали поиск <id>`.
- `src/bot/messages.ts` - format saved-search creation, saved-search list, stop confirmation, and alert messages.
- `src/bot/savedSearchChecker.ts` - shared scheduled-check logic with injectable fetch/send functions for tests.
- `src/krisha/searchRunner.ts` - shared public fetch/extract/sort function used by webhook and scheduled job.
- `netlify/functions/telegram.ts` - route new commands to storage and search runner.
- `netlify/functions/check-saved-searches.ts` - scheduled function.
- `netlify/functions/check-saved-searches-now.ts` - protected manual checker endpoint for smoke tests and emergency runs.
- `README.md` - document saved-search commands.
- `tests/*.test.ts` - parser, storage/dedupe, search runner mocks, and scheduled behavior tests.
- `netlify.toml` - scheduled function cron config if not using in-code schedule.

### MVP

- Commands:
  - `следи за <search request>`
  - `сохрани поиск <search request>`
  - `мои поиски`
  - `останови поиск <id>`
  - `удали поиск <id>`
- Default scheduled interval: every 30 minutes.
- Per run caps:
  - max active searches processed: 10
  - max new listings sent per saved search: 5
  - fetch only first public page
- Initial save will send current first-page results and mark them seen.
- Future scheduled checks send only unseen advert ids.

### Later Work

- `еще` command for additional pages.
- Per-search frequency, for example "каждые 10 минут".
- Client profiles and matching saved searches to named clients.
- Price-change detection.
- Team assignment in group chats.

### Implementation Checklist

- [x] Add saved-search types.
- [x] Add saved-search storage functions in Netlify Blobs.
- [x] Extract shared `runPublicSearch` from webhook fetch logic.
- [x] Extend command parser for saved-search commands.
- [x] Add saved-search Telegram messages.
- [x] Update `/api/telegram` for create/list/stop saved searches.
- [x] Add scheduled function for active saved searches.
- [x] Add protected manual saved-search checker endpoint.
- [x] Add tests for commands, dedupe, scheduled checks, and messages.
- [x] Run typecheck, tests, build, and audit.
- [x] Deploy to Netlify and verify scheduled function registration.
- [x] Manual smoke test: save a search and verify no duplicates on repeated check.

### Validation Plan

- `npm run typecheck`
- `npm test`
- `npm run build`
- `npm audit --audit-level=high --cache .npm-cache`
- Function-level tests use mocked listings and mocked Telegram sender.
- Production smoke:
  - send `следи за квартиры на продажу в Алматы до 60 млн`
  - receive saved search id
  - send `мои поиски`
  - send `останови поиск <id>`

### Risks And Rollback Notes

- Scheduled function may run with no active searches; this should be a no-op.
- Krisha may change public markup; search runner should fail one run without deleting state.
- Telegram send may fail; keep seen ids update conservative so failures can retry.
- Rollback: disable scheduled function or mark saved searches inactive; normal one-off search remains unaffected.

## Feature: Firecrawl Public Search Fallback

**Spec:** [docs/specs/2026-06-22-firecrawl-fallback.md](docs/specs/2026-06-22-firecrawl-fallback.md)
**Status:** [x] Gate 4 - implemented, deployed, and smoke-tested

### Architecture And Data Flow

```
runPublicSearch(searchUrl, limit, intent)
  -> direct Krisha fetch + local HTML extractor
  -> if listings found: return direct results
  -> if zero listings or fetch failure:
       -> if FIRECRAWL_API_KEY missing: keep current result
       -> POST https://api.firecrawl.dev/v2/scrape
       -> request markdown/html for the same public search URL
       -> extract /a/show/<id> links from Firecrawl output
       -> filter and sort with existing intent rules
       -> return fallback listings when found
```

Firecrawl remains optional and public-data-only. It does not use Krisha login, reveal phone numbers, solve CAPTCHA, rotate proxies, or interact with protected flows.

### Files To Create Or Modify

- `src/shared/config.ts` - add optional Firecrawl config helpers.
- `src/krisha/firecrawlClient.ts` - small REST client for `/v2/scrape`.
- `src/krisha/firecrawlExtractor.ts` - convert Firecrawl markdown/html output into `ListingResult[]`.
- `src/krisha/searchRunner.ts` - call fallback only after direct extraction fails or returns zero listings.
- `netlify/functions/health.ts` - show whether Firecrawl is configured without exposing secrets.
- `.env.example` - document `FIRECRAWL_API_KEY`.
- `README.md` - add setup note and safety boundary.
- `tests/searchRunner.test.ts` or new tests - cover direct precedence and fallback behavior.

### MVP

- REST `fetch` integration; no SDK dependency.
- Only `/v2/scrape`.
- Only `markdown` and `html` formats.
- Reuse existing `filterListingsForIntent` and `sortListingsForIntent`.
- Return at most the requested limit.

### Later Work

- Schema-guided JSON extraction if markdown/html fallback is not enough.
- Per-search source diagnostics in Telegram messages.
- Admin command to check Firecrawl availability.

### Implementation Checklist

- [x] Add Firecrawl config helpers and `.env.example` entry.
- [x] Add Firecrawl REST client.
- [x] Add Firecrawl listing extractor.
- [x] Wire fallback into `runPublicSearch`.
- [x] Add health flag.
- [x] Add tests.
- [x] Run typecheck, tests, build, and audit.
- [x] Deploy to Netlify and verify production health.

### Validation Plan

- `npm run typecheck`
- `npm test -- --run`
- `npm run build`
- `npm audit --audit-level=high --cache .npm-cache`
- Production smoke: `/` and `/api/health`.

### Risks And Rollback Notes

- Firecrawl may cost credits when enabled; keep fallback only and limit results.
- Firecrawl may still fail on protected or blocked pages; direct parser remains primary.
- Rollback is simple: remove `FIRECRAWL_API_KEY` from Netlify env or revert this feature.

## Feature: Flexible Filters And AI Intent Parser

**Spec:** [docs/specs/2026-06-17-flexible-krisha-filters.md](docs/specs/2026-06-17-flexible-krisha-filters.md)
**Status:** [x] Gate 4 - implemented, deployed, and smoke-tested

### Architecture And Data Flow

```
Telegram text
  -> /api/telegram
      -> detect command shell:
           search | save_search | list_searches | stop_search | status
      -> deterministic parser tries known phrases first
      -> if enabled and needed, AI Intent Parser normalizes natural text
      -> local validator checks every field against supported Krisha filters
      -> optional context merger handles "как прошлый, но ..."
      -> URL builder emits only approved das[...] params
      -> existing search runner / saved-search flow continues unchanged
```

The AI layer is only a translator from human text to a strict JSON candidate. It cannot directly build URLs, call Krisha, or invent filters. Local TypeScript validation decides what is allowed.

### Files To Create Or Modify

- `package.json` / `package-lock.json` - add `openai` only if using Netlify AI Gateway/OpenAI SDK.
- `.env.example` - add `AI_INTENT_ENABLED`, `AI_MODEL`, and AI gateway/provider notes.
- `src/bot/types.ts` - extend `SearchIntent` with optional flexible filter fields and parser warnings.
- `src/bot/intentSchema.ts` - define allowed JSON shape, defaults, merge rules, and validation errors.
- `src/bot/aiIntentParser.ts` - call AI provider with a strict prompt and parse JSON response.
- `src/bot/commandParser.ts` - keep command detection deterministic, delegate free-text search parsing to deterministic + AI parser.
- `src/bot/contextMerge.ts` - merge follow-up phrases with the previous task/saved search intent.
- `src/bot/messages.ts` - show understood filters, clarification questions, and unsupported filter warnings.
- `src/krisha/urlBuilder.ts` - emit optional filters from `src/reference/krisha/filters.json`.
- `src/krisha/reference.ts` / `src/krisha/aliases.ts` - add category and synonym support for richer phrases.
- `netlify/functions/telegram.ts` - await async parser and pass previous context where needed.
- `netlify/functions/health.ts` - report whether AI parsing is configured, without exposing secrets.
- `README.md` - document natural-language examples and AI env setup.
- `tests/*.test.ts` - add AI mock tests, URL filter tests, context merge tests, and regression tests for old commands.

### MVP

- Make all supported filters optional.
- Support these flexible apartment filters in URL building:
  - price from/to
  - rooms
  - house year from/to
  - square from/to
  - building type: panel, brick, monolith
  - owners only / agents only
  - new buildings
  - mortgage
  - apartment floor from/to
  - house floor count from
  - not first / not last
  - exchange
  - has phone
  - oldest-first sort
- Add category aliases:
  - `двушка`, `двухкомнатная`, `трешка`, `однушка`
  - `дом`, `дача`, `участок`, `земля`, `коммерция`
- Support AI understanding for natural phrases only when `AI_INTENT_ENABLED=true`.
- If AI is disabled or fails, keep deterministic parser working.
- Ask one short clarification when minimum fields are missing, for example city or sale/rent/category.
- Store rich intents in saved searches and re-run them in scheduled checks.

### Later Work

- Expand Krisha filter reference from live UI/category pages.
- Add rent categories after sale filters are stable.
- Add named client profiles: `для клиента Айбек`.
- Add negative filters and ranking rules: `исключи первые этажи`, `сначала старые`, `дешевле рынка`.
- Add a small admin command to show exactly which filters were understood.

### Implementation Checklist

- [x] Add async parser boundary and keep current deterministic parser tests green.
- [x] Add flexible `SearchIntent` fields and validator.
- [x] Add URL builder support for all current `filters.json` params.
- [x] Add category/room/seller/building/floor/year/square aliases.
- [x] Add AI intent parser behind `AI_INTENT_ENABLED`.
- [x] Add previous-intent context merge for simple follow-ups.
- [x] Add clarification and unsupported-filter messages.
- [x] Update saved-search storage compatibility for rich intents.
- [x] Add unit tests with mocked AI responses.
- [x] Add URL tests for rich filters.
- [x] Add Telegram function tests for async parsing and fallback behavior.
- [x] Update README and `.env.example`.
- [x] Run typecheck, tests, build, and audit.
- [x] Deploy to Netlify.
- [x] Configure AI environment on Netlify.
- [x] Production smoke test natural phrases and saved search alerts.

### Validation Plan

- `npm run typecheck`
- `npm test`
- `npm run build`
- `npm audit --audit-level=high --cache .npm-cache`
- Mocked AI parser tests must not call a live model.
- Production smoke examples:
  - `двушка Алматы до 45 хозяева не первый кирпич`
  - `следи за двушка Алматы до 45 хозяева не последний давно висит`
  - `как прошлый, но до 50`
  - `мои поиски`

### Risks And Rollback Notes

- AI may misunderstand a phrase. Mitigation: validate locally, show understood filters, and ask one clarification for ambiguity.
- AI provider or Netlify AI Gateway may be unavailable. Mitigation: `AI_INTENT_ENABLED=false` falls back to deterministic parsing.
- Krisha URL filters may differ by category. Mitigation: only emit verified params from the local filter reference and add warnings for unsupported filters.
- Existing saved searches may have older intent shape. Mitigation: keep backward-compatible defaults in validator.
- Rollback: disable `AI_INTENT_ENABLED` in Netlify env; existing deterministic search and saved-search monitoring continue working.

## Validation Plan

- `npm install` completes and writes `package-lock.json`.
- `npm run typecheck` passes.
- `npm test` passes.
- `npm run build` passes.
- Local smoke tests:
  - `POST /api/health` or `GET /api/health` returns OK.
  - Mock Telegram update from an unauthorized chat is rejected.
  - Mock Telegram update from an allowed chat builds a Krisha URL for apartments.
  - Mock Telegram update for land plots builds a Krisha URL using `prodazha/uchastkov`.
- Listing extraction is tested against a saved HTML fixture, not live Krisha traffic.
- Optional manual live check fetches only one public first page after user approval.
- Netlify deployment check:
  - `netlify.toml` points at `netlify/functions`.
  - Required environment variables are documented.
  - Webhook URL shape is documented: `https://<site>/api/telegram`.

## Environment Variables

- `TELEGRAM_BOT_TOKEN` - Telegram bot token.
- `TELEGRAM_ALLOWED_CHAT_IDS` - comma-separated allowlist.
- `TELEGRAM_WEBHOOK_SECRET` - optional Telegram webhook secret token.
- `KRISHA_FETCH_ENABLED` - `true` to allow live public page fetching; default false for local tests.
- `KRISHA_MAX_RESULTS` - optional per-response result cap, default 5.

## Risks And Rollback Notes

- Krisha page markup may change. Mitigation: keep extractor isolated and fixture-tested; if parsing fails, still return the generated search URL.
- Netlify Blobs is simple object storage, not a relational DB. Mitigation: wrap storage behind `blobStore.ts`; migrate later without touching bot parsing.
- Telegram webhook should answer quickly. Mitigation: MVP fetches only one page and returns a URL fallback if fetching fails.
- Public page fetch may be blocked or unavailable from Netlify. Mitigation: no retry storm; return the URL and store task status as `fetch_failed`.
- Secrets must not be committed. Mitigation: `.env.example` only documents names; real values live in Netlify env.
- Rollback: remove the Netlify site env/webhook or point Telegram webhook back to the previous URL; no Krisha account state is touched.

## Feature: Krisha Filter Reference Expansion

**Spec:** [docs/specs/2026-06-17-krisha-filter-reference-expansion.md](docs/specs/2026-06-17-krisha-filter-reference-expansion.md)
**Status:** [x] Gate 4 - implemented and locally verified

### Architecture And Data Flow

```
Telegram text
  -> deterministic parser extracts richer SearchIntent fields
  -> optional AI parser proposes the same validated fields
  -> Krisha URL builder maps fields to current public das[...] params
  -> search runner and saved-search flow stay unchanged
```

Districts are handled as geo URL paths, not query params. Structured Krisha fields are emitted only when they are known. Words such as furniture, balcony, parking, and repair for apartment searches can fall back to Krisha's public `_txt_` search field when no structured filter exists.

### Files To Modify

- `src/bot/types.ts` - add richer filter fields.
- `src/bot/commandParser.ts` - parse short realtor phrases for the new fields.
- `src/bot/intentSchema.ts` - validate AI-proposed fields.
- `src/bot/aiIntentParser.ts` - document the expanded JSON shape for AI parsing.
- `src/bot/messages.ts` - summarize new filters in Telegram replies.
- `src/krisha/aliases.ts` and `src/krisha/reference.ts` - add Almaty district geo aliases.
- `src/krisha/urlBuilder.ts` - emit the additional public Krisha params.
- `src/reference/krisha/filters.json` - document the new supported params.
- `README.md` - add examples.
- `tests/commandParser.test.ts` and `tests/urlBuilder.test.ts` - cover new behavior.

### Implementation Checklist

- [x] Add types and AI schema fields for apartments, houses, land, and commercial filters.
- [x] Add Almaty district aliases and geo nodes.
- [x] Extend deterministic parsing for land square, kitchen square, toilet, photos, pledge, house filters, land purpose, and commercial use cases.
- [x] Update URL builder mappings and fix apartment building type values.
- [x] Update messages, README, and filter reference docs.
- [x] Add regression tests for new filters and old examples.
- [x] Run typecheck, tests, build, and audit.

### Validation Plan

- `npm run typecheck`
- `npm test`
- `npm run build`
- `npm audit --audit-level=high --cache .npm-cache`

### Risks And Rollback Notes

- Krisha can change filter values; the local reference file should make mappings auditable.
- Text search fallback is less exact than structured filters, but safer than pretending unsupported fields are exact.
- Rollback is limited to parser and URL-builder changes; storage and Telegram functions remain unchanged.

## Feature: Realtor Opportunity Assistant

**Spec:** [docs/specs/2026-06-17-realtor-opportunity-assistant.md](docs/specs/2026-06-17-realtor-opportunity-assistant.md)
**Status:** [x] Gate 4 - implemented, deployed to Netlify, and smoke-tested

### Architecture And Data Flow

```
Telegram text
  -> /api/telegram
      -> command parser:
           search | save_search | market_analysis | real_estate_qa | existing commands
      -> for searches:
           run public Krisha search
           extract listing cards
           enrich listings with price/date/quality signals
           compare against saved history when available
           format realtor-facing reasons
      -> for saved-search checks:
           load listing history
           detect new / old / price-drop / repeated listings
           update history
           send alerts with reasons
      -> for market analysis:
           run same public search
           compute visible market snapshot
           reply with price range, median, cheap/expensive objects, and opportunities
      -> for real estate questions:
           answer with AI when configured
           otherwise return deterministic practical guidance
```

The assistant will use only public search data already fetched by the bot. Market analysis will be labeled as a heuristic snapshot from visible fetched listings, not a formal appraisal.

### Files To Create Or Modify

- `src/bot/types.ts` - add `market_analysis` and `real_estate_qa` command variants.
- `src/bot/commandParser.ts` - detect `анализ рынка ...`, `новые и старые ...`, and real-estate question fallback.
- `src/bot/messages.ts` - format opportunity labels, market snapshot, and Q&A answers.
- `src/bot/aiIntentParser.ts` - optionally support Q&A answer generation or reuse OpenAI-compatible fetch helper.
- `src/bot/realtorAssistant.ts` - new module for opportunity scoring and market analysis.
- `src/bot/realEstateQa.ts` - new module for real-estate question routing and fallback answers.
- `src/storage/types.ts` - add listing history records with first seen, last seen, last price, and price drops.
- `src/storage/blobStore.ts` - add listing-history read/write helpers per saved search.
- `src/bot/savedSearchChecker.ts` - detect price drops and old/new listing states during scheduled checks.
- `netlify/functions/telegram.ts` - route new commands to analysis/Q&A handlers.
- `README.md` - document examples and limits.
- `tests/*.test.ts` - add tests for scoring, market analysis, price-drop detection, command parsing, and messages.

### MVP

- Add opportunity labels for visible listings:
  - `новое` when first seen in a saved-search check;
  - `давно стоит` when public listing date or saved history supports it;
  - `снизили цену` when stored price history detects a lower price;
  - `ниже похожих` when price is below visible median for comparable fetched listings;
  - `выше похожих` / `переоценено` when price is high and listing is old;
  - `хозяин` when user explicitly searches owners only;
  - `слабая упаковка` when no photo/short text is detectable;
  - `участок/коммерция: высокая ценность лида` for land/commercial saved searches.
- Add `анализ рынка <search request>`:
  - parse request with existing search parser;
  - fetch public results;
  - parse numeric prices;
  - compute count, min, max, median, typical range;
  - show cheapest visible listings and expensive/old visible listings;
  - include caveat about sample size.
- Add `новые и старые <search request>`:
  - if saved-search history exists, split by first-seen/old/price-drop;
  - if no history exists, say that tracking starts after saving the search and still show visible listing dates.
- Add real-estate Q&A fallback:
  - messages about недвижимость, рынок, цена, объект, квартира, дом, участок, коммерция, ипотека, торг, риэлтор, клиент get an answer;
  - AI answer when configured;
  - deterministic fallback for common topics when AI is unavailable.

### Later Work

- Multi-page market scans with explicit caps.
- Named client profiles and matching objects to each client.
- Automatic weekly market reports.
- Price-per-square-meter analytics when enough listing detail is reliably extracted.
- Dashboard for saved searches and market snapshots.

### Implementation Checklist

- [x] Add command types for market analysis and Q&A.
- [x] Extend parser for `анализ рынка`, `новые и старые`, and real-estate question fallback.
- [x] Add listing price parser and opportunity scoring module.
- [x] Add market snapshot calculations.
- [x] Add listing history storage and price-drop detection.
- [x] Update saved-search checker to send reasoned alerts.
- [x] Update Telegram function routing.
- [x] Add Q&A module with AI and deterministic fallback.
- [x] Update Telegram messages and README.
- [x] Add unit tests and function tests.
- [x] Run typecheck, tests, build, and audit.
- [x] Deploy to Netlify only after explicit user approval.

### Validation Plan

- `npm run typecheck`
- `npm test -- --run`
- `npm run build`
- `npm audit --audit-level=high --cache .npm-cache`
- Function tests with mocked Krisha listings:
  - market analysis command returns median/range/opportunities;
  - saved-search check detects price drop;
  - real-estate question returns Q&A response;
  - non-real-estate text still gets help/clarification.
- Optional production smoke after deploy approval:
  - send `анализ рынка двушка Алматы до 45`;
  - send `следи за двушка Алматы до 45 хозяева`;
  - run manual saved-search checker twice and verify no duplicate spam.

### Risks And Rollback Notes

- Price analysis from one public page can be incomplete. Mitigation: label it as a visible-market snapshot and show sample size.
- Public card markup may not expose enough detail for every signal. Mitigation: only show labels when data supports them.
- AI Q&A may overstate advice. Mitigation: keep answers practical, short, and add caveats for legal/tax/mortgage/investment topics.
- Listing history in Netlify Blobs is lightweight. Mitigation: cap stored history per saved search and migrate later if needed.
- Rollback: disable AI Q&A with env settings, keep search URL generation, and ignore history labels without deleting saved searches.

## Feature: Telegram Tasks And Reminders

**Spec:** [docs/specs/2026-06-17-telegram-tasks-reminders.md](docs/specs/2026-06-17-telegram-tasks-reminders.md)
**Status:** [x] Gate 4 - implemented, deployed to Netlify, and smoke-tested

### Architecture And Data Flow

```
Telegram text
  -> /api/telegram
      -> command parser:
           create_task | list_tasks | complete_task | delete_task | existing commands
      -> task parser:
           extracts task text and optional due time
           supports "сегодня", "завтра", "через N минут/часов", "DD.MM в HH:mm"
      -> Netlify Blobs:
           store tasks by id
           maintain per-chat task index
           maintain due reminder index
      -> Telegram response:
           confirms task id, due time, or active task list

Netlify Scheduled Function
  -> /netlify/functions/check-reminders
      -> load due reminder ids
      -> send Telegram reminder once
      -> mark task as reminded
```

The MVP will be deterministic and timezone-aware for Asia/Almaty. It will not use AI parsing for reminders in the first iteration, so commands stay predictable and cheap.

### Files To Create Or Modify

- `src/bot/types.ts` - add task command variants.
- `src/bot/commandParser.ts` - detect task/reminder/list/done/delete commands before search fallback.
- `src/bot/taskParser.ts` - new deterministic parser for Russian reminder times and task text.
- `src/bot/taskMessages.ts` or `src/bot/messages.ts` - format task creation, list, done, delete, and due-reminder messages.
- `src/storage/types.ts` - add `ReminderTask`, task status, and create/update DTOs.
- `src/storage/blobStore.ts` - add task CRUD, chat task index, and due reminder index helpers.
- `src/bot/reminderChecker.ts` - shared scheduled-check logic with injectable clock/storage/sender for tests.
- `netlify/functions/telegram.ts` - route task commands.
- `netlify/functions/check-reminders.ts` - scheduled function for due reminders.
- `netlify/functions/check-reminders-now.ts` - protected manual smoke endpoint.
- `netlify.toml` - schedule reminder checker if not configured in function metadata.
- `README.md` - document task/reminder commands.
- `tests/*.test.ts` - parser, storage/index behavior, reminder checker, Telegram messages, and regression tests for existing commands.

### MVP

- Create task without due time:
  - `задача проверить документы по объекту 12345678`
  - `добавь задачу позвонить продавцу`
- Create reminder with due time:
  - `напомни завтра в 10 позвонить продавцу`
  - `напомни сегодня в 18:30 написать клиенту`
  - `напомни через 2 часа проверить объект`
  - `напомни 18.06 в 15:30 встретиться с клиентом`
- List active tasks:
  - `мои задачи`
  - `мои напоминания`
- Complete task:
  - `готово <id>`
- Delete task:
  - `удали задачу <id>`
- Scheduled checker:
  - sends due reminders once;
  - marks task as `reminded`;
  - does not remind completed or deleted tasks.

### Later Work

- Recurring reminders: every day, every week, every Monday.
- Task notes tied to advert ids: `заметка 12345678 ...`.
- Call pipeline statuses: `позвонить`, `позвонил`, `перезвонить`, `интересен`, `отказ`.
- Daily digest: `задачи на сегодня`.
- CRM export or dashboard.
- Calendar sync.

### Implementation Checklist

- [x] Add task/reminder types and statuses.
- [x] Implement deterministic Russian task time parser.
- [x] Extend command parser for task commands without breaking search commands.
- [x] Add Netlify Blobs task storage and indexes.
- [x] Add task/reminder Telegram message formatting.
- [x] Update `/api/telegram` routing.
- [x] Add scheduled reminder checker.
- [x] Add protected manual reminder checker endpoint.
- [x] Update README command examples.
- [x] Add unit tests and function tests.
- [x] Run typecheck, tests, build, and audit.
- [x] Deploy to Netlify after implementation approval and smoke-test production.

### Validation Plan

- `npm run typecheck`
- `npm test -- --run`
- `npm run build`
- `npm audit --audit-level=high --cache .npm-cache`
- Parser tests:
  - `завтра в 10`
  - `сегодня в 18:30`
  - `через 2 часа`
  - `через 30 минут`
  - `18.06 в 15:30`
- Reminder checker tests:
  - sends due active reminder once;
  - skips future tasks;
  - skips completed/deleted tasks;
  - does not mark reminded until Telegram send succeeds.
- Production smoke after deploy:
  - create reminder for a near-future time;
  - run protected manual checker;
  - verify Telegram reminder appears once;
  - list tasks and mark task done.

### Risks And Rollback Notes

- Natural date parsing can be misunderstood. Mitigation: support only clear MVP formats and echo parsed due time back to the user.
- Scheduled functions may run more than once or be delayed. Mitigation: store `remindedAt` and send each due reminder once.
- Telegram send may fail. Mitigation: update `remindedAt` only after send succeeds.
- Netlify Blobs indexes are lightweight. Mitigation: cap list sizes and keep storage wrapper isolated for future migration.
- Rollback: disable scheduled reminder function or ignore task commands; existing search and market features remain separate.

## Feature: Residential Complex Filter

**Spec:** [docs/specs/2026-06-17-residential-complex-filter.md](docs/specs/2026-06-17-residential-complex-filter.md)
**Status:** [x] Gate 4 - implemented, deployed to Netlify, and smoke-tested

### Architecture And Data Flow

```
Telegram text
  -> command parser / AI intent parser
      -> extract SearchIntent.residentialComplexName from "ЖК <name>"
      -> add the ЖК name to intent.textQuery for Krisha public search
  -> URL builder
      -> emits the existing public _txt_ query parameter
  -> search runner
      -> fetch public first page
      -> extract listing cards
      -> strict post-filter by visible ЖК name
      -> sort remaining matched cards
  -> Telegram messages / analysis
      -> show requested ЖК in summary
      -> if zero visible matches, explain that no public cards visibly matched
```

The post-filter is the safety rail: when a user asks for a specific ЖК, the bot should prefer returning fewer results over mixing unrelated listings into the answer.

### Files To Create Or Modify

- `src/bot/types.ts` - add `residentialComplexName?: string` to `SearchIntent`.
- `src/bot/commandParser.ts` - parse `ЖК <name>`, `жилой комплекс <name>`, and preserve the rest of the search request.
- `src/bot/intentSchema.ts` - accept and normalize AI-proposed residential complex names.
- `src/bot/aiIntentParser.ts` - document the optional `residentialComplexName` output field.
- `src/krisha/urlBuilder.ts` - include ЖК name in `_txt_` search together with existing text query.
- `src/krisha/listingMatcher.ts` - new strict visible-text matcher for requested ЖК names.
- `src/krisha/searchRunner.ts` - apply post-filter before sorting/slicing when `residentialComplexName` exists.
- `src/bot/messages.ts` - show ЖК in intent summary and no-match explanation.
- `README.md` - add ЖК examples and caveat about visible public card data.
- `tests/*.test.ts` - parser, AI normalization, URL, matcher, search runner, and message tests.

### MVP

- Supported phrases:
  - `двушка Алматы ЖК Rams City до 60`
  - `квартиры в ЖК 4YOU Алматы`
  - `жилой комплекс Terracotta Астана`
  - `анализ рынка ЖК Rams City Алматы`
- Matching rules:
  - normalize case, punctuation, `ё/е`, spaces, and hyphens;
  - strip leading `ЖК` / `жилой комплекс` from the requested name;
  - match against title, location, summary, and URL string available in public listing data;
  - do not return listings where the ЖК name is not visible.
- Messaging:
  - show `ЖК: <name>` in the understood filters;
  - if no cards match, say that the Krisha link was built but no visible public cards matched the requested ЖК.

### Later Work

- Curated alias dictionary for popular ЖК names and spelling variants.
- Multi-page scans for narrow ЖК searches.
- A command to save known aliases: `ЖК Rams = Rams City`.
- Price-per-square-meter analysis inside one ЖК.
- Separate new-build/secondary-market handling when public data supports it.

### Implementation Checklist

- [x] Add `residentialComplexName` to search intent types.
- [x] Add deterministic ЖК parser.
- [x] Add AI schema support for ЖК names.
- [x] Add URL text query composition for ЖК + existing text query.
- [x] Add strict listing matcher and post-filter in search runner.
- [x] Update Telegram summaries and no-match messages.
- [x] Ensure saved searches, market analysis, and tracked objects reuse filtered listings.
- [x] Update README examples.
- [x] Add unit tests and regression tests.
- [x] Run typecheck, tests, build, and audit.
- [x] Deploy to Netlify after implementation approval and smoke-test production.

### Validation Plan

- `npm run typecheck`
- `npm test -- --run`
- `npm run build`
- `npm audit --audit-level=high --cache .npm-cache`
- Test cases:
  - parse `ЖК Rams City`;
  - parse `жилой комплекс Terracotta`;
  - URL contains text query for the ЖК;
  - matcher keeps visible `Rams City` listing and rejects unrelated listings;
  - no-match message is shown when search fetch succeeds but all cards are filtered out;
  - existing search/reminder/saved-search commands still pass.
- Production smoke:
  - send a ЖК search that should at least build a link;
  - verify the response summary includes `ЖК`;
  - verify no unrelated listing is returned if visible cards do not match.

### Risks And Rollback Notes

- Krisha public cards may omit ЖК names. Mitigation: strict no-match explanation plus direct Krisha link.
- User may use spelling variants. Mitigation: normalize punctuation/case now; add alias dictionary later.
- Text query may narrow Krisha results too much or too little. Mitigation: post-filter remains authoritative.
- Rollback: ignore `residentialComplexName` in parser and search runner; normal city/category search continues working.
