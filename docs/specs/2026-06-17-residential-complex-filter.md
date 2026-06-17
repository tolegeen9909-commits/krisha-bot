# Residential Complex Filter

## Goal

Let the Telegram bot understand residential complex names in search requests and return only listings that visibly match the requested ЖК name.

## Users And Scenarios

- A realtor asks: `двушка Алматы ЖК Rams City до 60 млн`.
- A realtor asks: `найди квартиры в ЖК 4YOU 2 комнаты`.
- A realtor asks: `анализ рынка ЖК Terracotta Астана`.
- The bot should not return generic city listings when the user clearly requested a specific ЖК.

## In Scope

- Parse residential complex names from Russian requests:
  - `ЖК <name>`
  - `жк <name>`
  - `жилой комплекс <name>`
  - `в ЖК <name>`
- Store the parsed ЖК name in `SearchIntent`.
- Add the ЖК name to Krisha public text search where possible.
- Apply a strict post-filter after public listing extraction:
  - keep a listing only if the ЖК name is visible in the listing title, location, summary, or URL text available to the bot;
  - if no visible listings match, reply that the bot found the search URL but no cards visibly matched the requested ЖК.
- Show the requested ЖК in the Telegram intent summary.
- Support the same filtering in:
  - one-off search;
  - saved search;
  - market analysis;
  - new/old object view.
- Add tests for parsing, URL text query, post-filtering, and messages.

## Out Of Scope

- Automatic login to Krisha.
- Phone number reveal or contact scraping.
- Building a full official database of all ЖК names.
- Fuzzy matching across unknown aliases unless the name is visibly close in the listing text.
- Guaranteeing matches when Krisha does not expose the ЖК name in public card markup.
- Multi-page deep scans in this iteration.

## Constraints

- Must remain Netlify-compatible.
- Must use only public listing data already fetched by the bot.
- Must not invent hidden filters that are not present in local Krisha reference data.
- Must avoid returning irrelevant listings when a ЖК is explicitly requested.
- Existing filters, saved searches, market analysis, and reminders must keep working.

## Acceptance Criteria

- `двушка Алматы ЖК Rams City до 60` creates a search intent with `residentialComplexName = "Rams City"`.
- The Krisha URL includes a text search query for the ЖК name.
- Returned listings are post-filtered to visible ЖК matches only.
- If the public page returns listings but none visibly match the ЖК, the bot says that no visible cards matched the requested ЖК and still provides the Krisha search link.
- Saved searches with a ЖК name keep the strict filtering during scheduled checks.
- Market analysis for a ЖК uses only matched listings for median/range/opportunity calculations.
- Typecheck, tests, build, and audit pass before deployment.
