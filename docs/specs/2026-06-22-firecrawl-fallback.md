# Firecrawl Public Search Fallback

## Goal

Strengthen the Telegram Krisha bot by adding Firecrawl as an optional fallback reader for public Krisha search pages when the current direct HTML parser returns no listings or fails.

## Users And Scenarios

Realtors use Telegram to search and analyze public Krisha listings. When Krisha markup changes or a direct fetch returns a page that the local parser cannot extract, the bot should try Firecrawl once and return clean public listing data when available.

## In Scope

- Add optional Firecrawl REST API client using `FIRECRAWL_API_KEY`.
- Keep direct Krisha HTML parsing as the primary path.
- Use Firecrawl only for public search URLs and public listing fields.
- Parse Firecrawl markdown/HTML output into the existing `ListingResult` shape.
- Add health/config visibility without exposing secrets.
- Add tests for fallback success, disabled state, and direct-parser precedence.

## Out Of Scope

- Automating Krisha login.
- Revealing phone numbers or login-only data.
- CAPTCHA solving, proxy rotation, or anti-bot evasion.
- Firecrawl crawling/agent/interact modes.
- Paid plan setup or storing Firecrawl keys in source code.

## Constraints

- Must remain compatible with Netlify Functions.
- Must work without a Firecrawl key; feature is disabled when the key is missing.
- Must not add unnecessary runtime dependencies.
- Must not send real Telegram messages during tests.
- Must keep max result limits small and reuse existing filters/sorting.

## Acceptance Criteria

- If direct public fetch returns listings, Firecrawl is not called.
- If direct fetch succeeds but extracts zero listings, Firecrawl fallback can provide listings.
- If direct fetch fails and Firecrawl is configured, fallback can provide listings.
- If Firecrawl is not configured, current behavior remains unchanged.
- `npm run typecheck`, `npm test -- --run`, `npm run build`, and audit pass.
- Netlify production deploy and `/api/health` smoke check pass.
