# Krisha Telegram Bot

Netlify-compatible Telegram bot for safe public Krisha.kz search requests.

The bot accepts Russian text requests, builds Krisha search URLs from local reference data, optionally reads the first public search page, stores task/result state in Netlify Blobs, and replies in Telegram.

## Scope

Supported MVP requests:

- `квартиры на продажу в Астане 2-3 комнаты до 60 млн`
- `двушка Алматы Ауэзовский до 45 хозяева раздельный санузел с фото`
- `как прошлый, но до 50 и не последний`
- `дом Алматы от 100 млн 8 соток кирпич газовое отопление септик`
- `участок Алматы 6-10 соток ИЖС делимый не в залоге`
- `коммерция Алматы офис от 80 м2 в бизнес центре`
- `анализ рынка двушка Алматы до 45`
- `двушка Алматы ЖК Rams City до 60`
- `анализ рынка ЖК Terracotta Астана`
- `новые и старые участки Алматы ИЖС`
- `как понять что квартира переоценена?`
- `напомни завтра в 10 позвонить продавцу`
- `задача проверить документы по объекту 12345678`
- `мои задачи`
- `следи за 2-комн Алматы до 45 млн`
- `проверь мои поиски`
- `мои поиски`
- `останови поиск abc12345`
- `статус`

This project does not automate Krisha login, reveal phone numbers, solve CAPTCHA, rotate proxies, or imitate human browsing behavior.

## Local Setup

```bash
npm install --cache .npm-cache
npm run typecheck
npm test
npm run build
```

Create a local `.env` from `.env.example` when running through Netlify Dev.

```bash
TELEGRAM_ALLOWED_CHAT_IDS=123456789
TELEGRAM_WEBHOOK_SECRET=some-random-secret
KRISHA_FETCH_ENABLED=false
KRISHA_MAX_RESULTS=5
AI_INTENT_ENABLED=false
AI_MODEL=gpt-4o-mini
FIRECRAWL_API_KEY=
```

Run locally:

```bash
npm run dev
```

Health endpoint:

```bash
curl http://localhost:8888/api/health
```

Manual saved-search check endpoint, protected by the same Telegram webhook secret:

```bash
curl -X POST http://localhost:8888/api/check-saved-searches \
  -H "X-Telegram-Bot-Api-Secret-Token: $TELEGRAM_WEBHOOK_SECRET"
```

Manual reminder check endpoint, protected by the same Telegram webhook secret:

```bash
curl -X POST http://localhost:8888/api/check-reminders \
  -H "X-Telegram-Bot-Api-Secret-Token: $TELEGRAM_WEBHOOK_SECRET"
```

## Netlify Environment

Set these in Netlify environment variables:

- `TELEGRAM_ALLOWED_CHAT_IDS` - comma-separated Telegram chat IDs allowed to use the bot.
- `TELEGRAM_BOT_TOKEN` - Telegram bot token, required for manual saved-search update messages and scheduled reminders.
- `TELEGRAM_WEBHOOK_SECRET` - random secret sent by Telegram in `X-Telegram-Bot-Api-Secret-Token`.
- `KRISHA_FETCH_ENABLED` - `true` to fetch one public Krisha result page; default should stay `false` until manually tested.
- `KRISHA_MAX_RESULTS` - max listings in a reply, default `5`, capped at `10`.
- `AI_INTENT_ENABLED` - `true` to allow AI parsing for informal phrases that deterministic parsing cannot understand.
- `AI_MODEL` - model for AI intent parsing, default `gpt-4o-mini`.
- `OPENAI_BASE_URL` - optional OpenAI-compatible gateway URL, for example Netlify AI Gateway.
- `OPENAI_API_KEY` - optional OpenAI API key when not using Netlify AI Gateway.
- `FIRECRAWL_API_KEY` - optional Firecrawl key for fallback public-page reading when the direct Krisha parser finds no listings or direct fetch fails.

The webhook can answer simple Telegram requests directly, but manual saved-search checks and scheduled reminders need `TELEGRAM_BOT_TOKEN` because they can send messages outside the immediate webhook response.

## Natural Language Parsing

The deterministic parser handles common realtor phrases directly:

- `двушка Алматы до 45 хозяева не первый кирпич`
- `квартиры Астана 2015-2022 от 60 до 90 млн ипотека`
- `дома Алматы от 100 млн площадь от 120 м2`
- `двушка Алматы Ауэзовский до 45 раздельный санузел с фото`
- `дом Алматы от 100 млн 8 соток кирпич газовое отопление септик`
- `участок Алматы от 6 до 10 соток ИЖС делимый не в залоге`
- `коммерция Алматы офис от 80 м2 в бизнес центре с арендаторами`

Supported public filters now include price, rooms, city/region, selected Almaty districts, area, kitchen area, land area in sotkas, house year, floor, floor count, building/material type, owners/agents, photos, pledge state, toilet/phone type, former dormitory, house condition, heating, sewage, land purpose, land divisibility, commercial use case, commercial location, tenants, active business, exchange, and Krisha text search fallback for phrases like furniture, balcony, parking, lift, and repair.

When `AI_INTENT_ENABLED=true`, the bot can also ask the AI parser to normalize short or incomplete phrasing. AI output is validated locally before any Krisha URL is built.

## Realtor Assistant

The bot also adds realtor-facing signals to public listings:

- `новое для мониторинга` - first seen in the current saved-search history.
- `давно стоит` - visible public date or saved history suggests the object has been listed for a while.
- `снизили цену` - saved history sees a lower price for the same advert id.
- `ниже похожих на видимой выдаче` - public price is below the visible median for fetched results.
- `похоже на переоцененный старый объект` - high price plus old listing signal.
- `слабая упаковка карточки` - limited visible description in the public card.

Useful commands:

- `анализ рынка двушка Алматы до 45` - returns a visible-market snapshot: count, price range, median, typical range, cheap options, and opportunities.
- `новые и старые двушка Алматы до 45` - splits fetched listings by new, price-drop, and long-listed signals when saved-search history exists.
- `как понять что квартира переоценена?` - answers practical real-estate questions. AI is used only when configured; otherwise the bot returns deterministic guidance.

Market analysis is a heuristic snapshot from fetched public listings, not an official appraisal.

## Firecrawl Fallback

Firecrawl can strengthen public search reading when enabled with `FIRECRAWL_API_KEY`.

The bot still tries the local Krisha HTML parser first. Firecrawl is called only if the direct parser returns no listings or the direct fetch fails. Firecrawl output is converted back into the same public listing fields: title, price, URL, date text, and summary when visible.

Firecrawl is not used for Krisha login, hidden phone numbers, CAPTCHA solving, proxy rotation, or protected account-only data. If `FIRECRAWL_API_KEY` is empty, the bot behaves exactly like before.

## Residential Complex Search

The bot understands residential complex names in public apartment searches:

- `двушка Алматы ЖК Rams City до 60`
- `квартиры в ЖК 4YOU Алматы`
- `анализ рынка ЖК Terracotta Астана`

When a ЖК name is requested, the bot adds it to Krisha text search and then strictly filters public listing cards. It returns only listings where the ЖК name is visibly present in the title, location, summary, or URL text available to the bot. If the public cards do not show that ЖК name, the bot returns the Krisha link and explains that no visible cards matched.

## Tasks And Reminders

The bot can keep simple realtor tasks inside Telegram:

- `задача проверить документы по объекту 12345678` - create a task without a due time.
- `напомни завтра в 10 позвонить продавцу` - create a one-time reminder.
- `напомни через 2 часа проверить объект` - relative reminder.
- `напомни 18.06 в 15:30 написать клиенту` - date/time reminder.
- `мои задачи` - list active tasks.
- `готово abc12345` - close a task.
- `удали задачу abc12345` - delete a task.

Reminder parsing uses the Asia/Almaty timezone. Scheduled reminder delivery uses `TELEGRAM_BOT_TOKEN`.

## Telegram Webhook

After deploying to Netlify, set the webhook:

```bash
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -d "url=https://YOUR_NETLIFY_SITE.netlify.app/api/telegram" \
  -d "secret_token=$TELEGRAM_WEBHOOK_SECRET"
```

## Data

The runtime uses copied reference snapshots from the old project:

- `src/reference/krisha/geo.json`
- `src/reference/krisha/categories.json`
- `src/reference/krisha/filters.json`

Update those files deliberately from `docs/krisha-kz-parser-main/docs/krisha-reference/` when the source snapshot changes.

## Deployment

Netlify reads `netlify.toml`:

- build command: `npm run build`
- publish directory: `public`
- functions directory: `netlify/functions`

Deploy normally through Netlify Git integration or Netlify CLI.
