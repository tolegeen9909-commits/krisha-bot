# krisha-bot

**GitHub:** https://github.com/bronxtc52/krisha-kz-parser

## Описание
24/7 бот парсинга телефонов с krisha.kz. Задания — URL поиска с фильтрами, результаты — в PostgreSQL.

## Стек
- Python 3.12, Playwright, aiohttp
- PostgreSQL + SQLAlchemy (async) + Alembic
- Azure Key Vault (все секреты — только через KV, никаких plaintext)
- Docker / docker-compose

## Критичные ограничения
- **Имитация человека обязательна** — случайные паузы 0.5–3с, cookies, realistic User-Agent
- Блокировка аккаунта уже была — макс 2–3 теста с паузой ≥2с
- Секреты только в Azure KV, не в `.env`/коде

## Запуск
```bash
docker-compose up -d        # PostgreSQL + бот
python cli.py --help        # CLI для управления заданиями
```

## Структура
```
bot/
  parser/       — парсер krisha.kz (Playwright + human imitation)
  services/     — бизнес-логика (телефоны, задания)
  secrets.py    — Azure KV интеграция
  scheduler.py  — планировщик обхода
scripts/
  save-session.py   — авторизация и сохранение cookies → KV
  kz-tunnel.py      — SSH-туннель для обхода гео-блокировки
```
