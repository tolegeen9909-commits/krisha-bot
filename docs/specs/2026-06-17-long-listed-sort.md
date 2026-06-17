# Long-Listed Sorting

## Goal

Let the Telegram bot understand requests like "сначала выведи объявления которые уже долго продаются" and show older public Krisha listings before newer ones when the public search page contains listing date text.

## Users And Scenarios

The user writes a natural Russian search request with a sorting hint, for example:

- `квартиры на продажу в Алматы до 60 млн сначала те что давно продаются`
- `участки в Алматы, сначала старые объявления`

The bot should keep the normal filters, read public listing cards, extract visible date text, sort older cards first, and show the date in the reply when available.

## In Scope

- Detect Russian phrases for old-first sorting.
- Extract visible public listing date text from search cards.
- Convert common public date text to a sortable timestamp.
- Sort only the fetched public search page in MVP.
- Display the date text beside listing results when available.
- Add tests for parser, extractor, and sorting behavior.

## Out Of Scope

- Login to Krisha.kz.
- Phone reveal or private/contact data.
- Crawling many pages to find the oldest listing across all Krisha.
- Guaranteeing exact listing age when Krisha does not expose a date in the public card.

## Constraints

- Keep public fetching low-volume.
- Do not add anti-bot bypass behavior.
- If date text is missing, keep original order and do not pretend the age is known.

## Acceptance Criteria

- The parser marks `oldest_first` when the user asks for "давно продаются", "долго продаются", or "старые объявления".
- Public listing extraction captures date text such as `17 июня`, `вчера`, `2 дня назад`, or relative hours/minutes.
- When `oldest_first` is requested, listings with older parsed dates appear before newer parsed dates.
- Telegram response includes the date text when available.
