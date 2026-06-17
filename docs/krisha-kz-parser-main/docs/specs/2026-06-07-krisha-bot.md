# ТЗ: krisha-bot — парсер телефонов с krisha.kz

**Дата:** 2026-06-07
**Статус:** на согласовании

---

## Цель

Автономный backend-сервис без UI, работающий 24/7. Парсит телефоны с объявлений
krisha.kz по заданным фильтрам, хранит в PostgreSQL. Управление и интеграция — только
через MCP-сервер. CLI — для ops/debug.

Веб-интерфейс не входит в этот проект. Управление задачами и получение данных —
обязанность CRM (отдельный сервис), который подключается через MCP.

---

## Архитектура

```
CRM (отдельный сервис)
    ↕ MCP (stdio-транспорт)
krisha-bot
    ├── mcp_server     ← единственный внешний интерфейс
    ├── scheduler      ← APScheduler, фоновый обход заданий 24/7
    ├── parser         ← парсинг krisha.kz, имитация человека
    └── PostgreSQL     ← хранение заданий и телефонов

CLI                    ← ручное управление для ops/debug
```

---

## Сценарии использования

1. **CRM создаёт задание** — передаёт имя, URL поиска krisha.kz с фильтрами, интервал.
   Бот добавляет задание в БД и начинает парсить по расписанию.

2. **Бот работает 24/7** — планировщик запускает каждое активное задание по интервалу,
   обходит объявления, собирает телефоны, дедуплицирует.

3. **CRM забирает телефоны** — запрашивает номера по `task_id` и статусу `pending`,
   обрабатывает (обзвон/WhatsApp через WAHA), помечает `sent` или `failed`.

4. **Ops/debug через CLI** — запуск сервиса, ручное добавление заданий, просмотр статуса.

---

## MCP-сервер — инструменты

Транспорт: **stdio** (локальный MCP для подключения CRM).

| Инструмент | Параметры | Описание |
|---|---|---|
| `create_task` | `name, url, interval_minutes` | Создать задание парсинга |
| `list_tasks` | — | Список всех заданий со статусами и счётчиками |
| `get_task` | `task_id` | Детали одного задания |
| `start_task` | `task_id` | Запустить / возобновить задание |
| `pause_task` | `task_id` | Поставить на паузу |
| `delete_task` | `task_id` | Удалить задание и его телефоны |
| `get_phones` | `task_id, limit, status?` | Получить номера (по умолчанию `pending`) |
| `mark_phones` | `phone_ids, status` | Пометить номера: `sent` / `failed` |
| `get_stats` | `task_id?` | Статистика: pending/sent/failed, собрано за день |

---

## Парсинг — критичные требования

### Имитация человека (ОБЯЗАТЕЛЬНО)
Без этого krisha.kz блокирует IP:
- Случайные паузы между запросами к объявлениям: **1–3 сек**
- Случайные паузы между страницами пагинации: **2–5 сек**
- Реалистичный User-Agent (Chrome/macOS, не менять в рамках сессии)
- Полная сессия с cookies (первый запрос — страница объявления, второй — ajaxPhones)
- Обязательные заголовки: `Referer: <URL объявления>`, `X-Requested-With: XMLHttpRequest`

### Логика парсинга
1. Загрузить страницу поиска по URL задания → собрать ссылки на объявления
2. Для каждого нового объявления (не в БД): GET страницы → GET `/a/ajaxPhones?id=<id>`
3. Сохранить телефон(ы) в БД, привязать к `task_id`
4. Дедупликация: один номер не хранится дважды в рамках одного задания
5. Пагинация: обойти все страницы выдачи
6. Fallback: Playwright, если API вернул ошибку или изменился эндпоинт

---

## Схема БД (PostgreSQL)

```sql
tasks
  id, name, url, interval_minutes,
  status (active/paused/deleted),
  last_run_at, created_at

listings
  id, task_id, advert_id (krisha internal id),
  listing_url, parsed_at

phones
  id, task_id, listing_id,
  phone (normalized),
  waha_status (pending/sent/failed),
  collected_at, updated_at
```

---

## CLI-команды

```bash
python cli.py serve                              # запустить бота (MCP + планировщик)
python cli.py task add --name "..." --url "..." --interval 30
python cli.py task list
python cli.py task start <id>
python cli.py task pause <id>
python cli.py phones list --task <id> --status pending
python cli.py status                             # здоровье: БД, планировщик, кол-во заданий
```

---

## Стек

- **Python 3.12**
- **Парсер:** `requests` + `BeautifulSoup` (основной), `playwright` (fallback)
- **БД:** PostgreSQL + SQLAlchemy 2.x + Alembic
- **Планировщик:** APScheduler 3.x (AsyncIOScheduler)
- **MCP:** `mcp` Python SDK (FastMCP)
- **CLI:** Click
- **Деплой:** Docker Compose (bot + postgres)

---

## Границы MVP

Не входит в эту итерацию:
- Прокси / ротация IP
- Уведомления (Telegram / email)
- Авторизация MCP (токен/ключ)
- Captcha-solver
- HTTP/SSE транспорт для MCP (пока только stdio)
- Веб-интерфейс (это отдельный сервис — CRM)
