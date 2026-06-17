# Krisha Filter Reference Expansion

## Goal

Make the Telegram bot understand more Krisha.kz public search filters in plain Russian, so a realtor can write short natural requests without filling every field manually.

## Users And Scenarios

Realtors ask for apartments, houses, land plots, or commercial real estate using phrases such as:

- `двушка Алматы Ауэзовский до 45 хозяева раздельный санузел с фото`
- `дом Алматы от 100 млн 8 соток кирпич газовое отопление септик`
- `участок Алматы 6-10 соток ИЖС делимый не в залоге`
- `коммерция Алматы офис от 80 м2 в бизнес центре с арендаторами`

## In Scope

- Public Krisha URL filters only.
- More structured filters for apartments, houses, land, and commercial sale categories.
- Almaty district aliases as geo URL paths.
- Free-text query fallback for useful words that are visible in listings but not exposed as structured filters.
- Deterministic parser updates plus AI intent schema updates.
- Tests for parsing and URL construction.

## Out Of Scope

- Krisha login automation.
- CAPTCHA solving, proxy rotation, phone reveal, or stealth browsing.
- Exhaustive nationwide microdistrict mapping.
- Rental categories.
- Production deployment unless explicitly requested.

## Constraints

- Keep Netlify Functions compatible.
- Keep secrets out of code and docs.
- Use local reference data to validate supported filters before building URLs.
- If Krisha markup changes, unsupported filters should fail softly or fall back to public text search.

## Acceptance Criteria

- The bot builds correct Krisha URLs for new supported filters.
- Old request examples still work.
- `кирпич`, `панель`, and `монолит` use current Krisha values for apartment building type.
- Requests with district names like `Ауэзовский район` resolve to district URLs.
- Tests, typecheck, and build pass locally.
