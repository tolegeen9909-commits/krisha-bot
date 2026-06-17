# Realtor Opportunity Assistant

## Goal

Turn the Telegram bot from a simple Krisha search helper into a realtor assistant that:

- highlights which listings are worth attention and why;
- monitors the 9 realtor-useful listing signals discussed with the user;
- performs routine search work across new and long-standing objects;
- gives a practical market snapshot for a requested segment;
- answers general real estate questions in Telegram when the message is about real estate.

## Users And Scenarios

Realtors use the bot to reduce daily Krisha monitoring work:

- A realtor searches `двушка Алматы Бостандык до 45 хозяева` and receives not only listings, but labels such as `новое`, `давно висит`, `ниже похожих`, `есть торг`, `слабая упаковка`.
- A realtor saves a search and later receives alerts when a matching listing appears or drops price.
- A realtor writes `анализ рынка двушки Бостандык до 60` and receives a short market view: price range, median/typical price, cheapest visible options, expensive long-standing objects, and opportunity signals.
- A realtor writes `покажи новые и старые объекты по участкам Алматы ИЖС` and the bot separates newly found listings from listings that have been visible for a long time.
- A realtor asks a question like `как понять что квартира переоценена?` and gets a short practical real estate answer.
- A realtor asks about a client request and the bot explains what to track.

## In Scope

- Add realtor opportunity labels for returned listings:
  - long-listed / old listing;
  - new listing;
  - price below comparable listings on the fetched page;
  - price drop in saved-search monitoring;
  - owner-focused opportunity when the search/filter is owners only;
  - client-match explanation for saved searches;
  - overpriced and long-listed;
  - weak packaging signals such as no photo or very short/poor text when detectable from public cards;
  - land/commercial opportunity labels.
- Store lightweight price history for saved-search listings so future checks can detect price decreases.
- Store first-seen and last-seen timestamps for saved-search listings so the bot can classify objects as new or old within the bot's own monitoring history.
- Add a concise `why this matters` block to Telegram search results and saved-search alerts.
- Add a market analysis command/fallback for search-like requests:
  - visible count from fetched public page;
  - parsed price distribution when prices are available;
  - min, max, median, and typical range;
  - cheapest visible listings;
  - expensive listings that are also long-standing when detectable;
  - owner/agent and land/commercial notes when detectable from public cards or the user's filters;
  - clear note that this is a heuristic snapshot from public fetched results, not a formal appraisal.
- Add a real estate Q&A fallback:
  - if the message is not a search command but is clearly about real estate, answer the question;
  - use AI when configured;
  - keep answers short, practical, and in Russian;
  - include safety caveats for legal, tax, mortgage, or investment questions.
- Keep existing search and saved-search commands working.

## Out Of Scope

- Exact professional appraisal across the full market.
- Deep multi-page market research in the first iteration unless explicitly enabled with conservative caps.
- Legal, tax, banking, or investment advice presented as final truth.
- Krisha login automation, phone reveal, CAPTCHA solving, proxy rotation, or stealth browsing.
- Scraping many pages aggressively.
- CRM/client database in this iteration.
- Automatic outbound messages to property owners.

## Constraints

- Must remain compatible with Netlify Functions and Netlify Blobs.
- Must use only public listing data already fetched by the bot.
- Must not expose secrets or credentials.
- Price-below-market and overpriced signals must be labeled as heuristic, based on the visible fetched result set.
- Market analysis must be honest about sample size and data source.
- The first implementation should use a conservative public fetch scope; broader scans can be added after the scoring and storage are stable.
- If AI is disabled or unavailable, the bot should still do search/monitoring and provide a simple fallback response for real estate questions.

## Acceptance Criteria

- Search replies include concise opportunity labels where data supports them.
- Saved-search alerts include a reason such as `новое объявление`, `снижение цены`, `подходит сохраненному поиску`, or `ниже похожих на первой странице`.
- Price decreases are detected between saved-search checks when the same advert id appears with a lower parsed price.
- The bot can answer `анализ рынка <search request>` with a market snapshot based on fetched listings.
- The bot can separate tracked listings into `новые`, `старые/давно стоят`, and `снизили цену` when saved-search history exists.
- Real estate questions that are not search commands receive a useful answer instead of only the search help text.
- Non-real-estate messages still get normal help/clarification.
- Existing tests continue to pass, with new tests for opportunity labels, price-drop detection, and Q&A routing.
