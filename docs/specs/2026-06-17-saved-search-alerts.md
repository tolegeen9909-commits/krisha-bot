# Saved Search Alerts

## Goal

Add a monitoring mode for realtors: the user can save a Krisha search in Telegram, and the bot will periodically check the public search results and send only new listings that were not sent before.

This removes the need to manually open Krisha throughout the day for the same client filters.

## Users And Scenarios

Primary user: realtor using Telegram.

Scenario 1: Save a monitoring search.
The user writes: `следи за 2-комн Алматы до 45 млн` or `сохрани поиск квартиры в Алматы до 60 млн`. The bot parses the same filters it already supports, creates a saved search, runs an initial check, and replies with the saved search id and first results.

Scenario 2: Receive new listing alerts.
On a schedule, the bot checks saved searches and sends only listings whose advert id has not been sent before for that saved search.

Scenario 3: List saved searches.
The user writes: `мои поиски`. The bot returns saved searches with id, query summary, last check time, and sent listing count.

Scenario 4: Pause or delete a saved search.
The user writes: `останови поиск 3` or `удали поиск 3`. The bot marks the saved search inactive so scheduled checks stop.

## In Scope

- Telegram commands:
  - `следи за ...`
  - `сохрани поиск ...`
  - `мои поиски`
  - `останови поиск <id>`
  - `удали поиск <id>`
- Store saved searches in Netlify Blobs.
- Store sent advert ids per saved search to prevent repeats.
- Scheduled Netlify Function that checks active saved searches.
- Fetch only public Krisha search pages.
- Limit checks to the first public result page in MVP.
- Send concise Telegram alerts for new listings.
- Reuse existing parser, URL builder, listing extractor, date extraction, and sorting.
- Keep `KRISHA_FETCH_ENABLED=true` as a required condition for scheduled monitoring.

## Out Of Scope

- Login to Krisha.kz.
- Phone reveal or private/contact data.
- CAPTCHA solving, anti-bot bypass, stealth browser behavior, proxy rotation.
- Monitoring all pages across Krisha.
- AI valuation or market scoring.
- Multi-user team assignment.
- CRM pipeline.

## Constraints

- Netlify scheduled functions have short runtime, so each run must be small and bounded.
- Default schedule should be conservative, for example every 15 or 30 minutes.
- Each scheduled run should cap active searches processed and listings sent.
- If Krisha is unavailable or markup changes, the bot should skip that run and keep saved search state.
- No duplicate alerts for the same advert id within the same saved search.

## Acceptance Criteria

- User can save a supported search from Telegram.
- User can list saved searches.
- User can stop/delete a saved search.
- Scheduled function checks active saved searches and sends only unseen listings.
- Sent advert ids are persisted.
- Tests cover command parsing, saved search storage, deduplication, and scheduled check behavior with mocked listings.
- Production deploy passes and a manual smoke test can save a search without sending duplicate alerts.
