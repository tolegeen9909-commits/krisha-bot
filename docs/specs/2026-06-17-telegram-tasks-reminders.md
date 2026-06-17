# Telegram Tasks And Reminders

## Goal

Add simple task and reminder commands to the Telegram bot so a realtor can turn search results and call notes into follow-up work without leaving Telegram.

## Users And Scenarios

- A realtor finds an interesting listing and wants to remember to call the seller later.
- A realtor opens a phone number manually on Krisha and wants to save a follow-up task in the bot.
- A realtor wants a daily working list of active tasks.
- A realtor wants the bot to send a Telegram reminder when a task is due.

## In Scope

- One-time reminder commands in Russian:
  - `напомни завтра в 10 позвонить продавцу`
  - `напомни через 2 часа проверить объект`
  - `напомни 18.06 в 15:30 написать клиенту`
- Plain task commands without due time:
  - `задача проверить документы по объекту 12345678`
  - `добавь задачу позвонить продавцу`
- Task management commands:
  - `мои задачи`
  - `мои напоминания`
  - `готово <id>`
  - `удали задачу <id>`
- Store tasks in Netlify Blobs by Telegram chat id.
- Add a Netlify scheduled function that checks due reminders and sends Telegram messages.
- Use Asia/Almaty as the default timezone for natural date parsing.
- Keep task text user-provided and do not expose secrets.

## Out Of Scope

- Automatic Krisha login or phone reveal.
- Reading contacts from Krisha automatically.
- Recurring reminders such as every Monday or every day.
- Team assignment, roles, CRM pipeline dashboards, or calendar sync.
- Legal, financial, or contract workflow automation.

## Constraints

- Must remain compatible with Netlify Functions and Netlify scheduled functions.
- Must use existing Telegram allowlist and webhook secret patterns.
- Scheduled reminders require `TELEGRAM_BOT_TOKEN` in Netlify environment.
- Reminder parsing should be deterministic for the MVP and avoid live AI calls.
- The bot should not send duplicate reminders if a scheduled check runs twice.

## Acceptance Criteria

- User can create a task without due time and see it in `мои задачи`.
- User can create a reminder with `завтра`, `сегодня`, `через N минут/часов`, and `DD.MM в HH:mm`.
- User can mark a task done with `готово <id>`.
- User can delete a task with `удали задачу <id>`.
- Due reminders are sent once through the scheduled checker.
- Existing search, saved search, market analysis, and real-estate Q&A commands keep working.
- Typecheck, tests, build, and audit pass before deployment.
