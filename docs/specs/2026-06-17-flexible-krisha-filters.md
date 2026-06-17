# Flexible Krisha Filters

## Goal

Allow the Telegram bot to understand richer Krisha.kz search tasks with optional filters, so a realtor can write a natural request without filling every field.

The bot should use every supported filter it recognizes, ignore nothing silently when a requested filter is unsupported, and ask a short clarification only when the request is too ambiguous to build a useful search.

## Users And Scenarios

- A realtor writes: `следи за 2-комн Алматы до 45 млн не первый не последний кирпич хозяева`.
- A realtor writes: `квартиры Астана 2015-2022 от 60 до 90 млн ипотека`.
- A realtor writes: `дома Алматы от 100 млн площадь от 120 м2`.
- A realtor writes only partial details: `Алматы до 60 млн 2-комн`, and the bot infers apartment sale.
- A realtor asks for a filter the bot does not support yet; the bot explains which part was not understood and still gives a useful next step.

## In Scope

- Make filters optional: the bot should accept any subset of recognized filters.
- Extend parsed intent with flexible filters:
  - transaction: sale first, with parser structure ready for rent later
  - category: apartments, land plots, houses/dachas, commercial property where URL support is known
  - geo: city/region when provided
  - price from/to
  - rooms
  - house/build year from/to
  - total/living square from/to when supported by Krisha URL params
  - building type: panel, brick, monolith
  - seller type: owners only, agents only
  - new building
  - mortgage
  - apartment floor from/to
  - house floors from
  - not first floor
  - not last floor
  - exchange
  - has phone
  - oldest-first sorting phrase already supported
- Update URL builder to include all filters from `src/reference/krisha/filters.json`.
- Add parser feedback for unsupported filters instead of pretending they were applied.
- Add an AI intent parser for short, natural, incomplete phrases, with deterministic validation before any Krisha URL is built.
- Support context-aware edits for simple follow-ups like `как прошлый, но до 50 и не первый`.
- Keep saved-search alerts compatible with flexible filters.
- Add tests for rich requests, partial requests, and unsupported-filter feedback.

## Out Of Scope

- Krisha login automation, phone reveal, CAPTCHA solving, proxy rotation, or stealth browsing.
- Filling private/account-only Krisha filters that are not available in public URL search.
- Guaranteed support for every current Krisha UI filter until the filter reference snapshot is expanded and verified.
- A visual form UI in this iteration.

## Constraints

- Netlify-compatible TypeScript implementation.
- Public Krisha result pages only.
- Real secrets stay in `.env` locally and Netlify Environment Variables in production.
- AI access must be configurable and disabled safely when the provider/gateway is unavailable.
- The model may suggest intent only; local validation remains the source of truth for supported Krisha filters.
- The first iteration uses the existing local Krisha reference snapshot captured on 2026-06-07.
- If the user wants literally every current Krisha UI filter, we need a separate reference-update pass to map missing category-specific filters safely.

## Acceptance Criteria

- Existing one-time search and saved-search alerts still work.
- A request may omit any filter except the minimum needed to avoid ambiguity.
- `2-комн Алматы до 45 млн` builds an apartment search without requiring the word `квартиры`.
- `двушка Алматы до 45, хозяева, не первый, давно висит` is understood as a filtered apartment search.
- `как прошлый, но до 50 и без первых этажей` updates the previous search context when available.
- Rich apartment request with price, rooms, owner/agent, building type, year, floor, mortgage/new-building flags builds the correct Krisha URL params.
- Saved search can store and later re-run a rich filtered request.
- If the bot sees unsupported wording such as a filter not in the current reference, it replies with a clear short message.
- `npm run typecheck`, `npm test`, `npm run build`, and `npm audit --audit-level=high --cache .npm-cache` pass.
- Netlify production deploy succeeds and `/api/health` plus Telegram webhook smoke checks pass.
