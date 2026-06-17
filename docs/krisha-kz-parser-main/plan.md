# Plan: krisha-bot

Статус: [ ] в работе

---

## Файловая структура

```
krisha-bot/
├── bot/
│   ├── __init__.py
│   ├── database.py              # SQLAlchemy engine + session factory
│   ├── models.py                # ORM-модели: Task, Listing, Phone
│   ├── parser/
│   │   ├── __init__.py
│   │   ├── human.py             # Имитация человека: задержки, User-Agent, сессия
│   │   ├── krisha.py            # Основной парсер: пагинация + ajaxPhones
│   │   └── playwright_fb.py     # Fallback через Playwright
│   ├── services/
│   │   ├── __init__.py
│   │   ├── task_service.py      # Бизнес-логика заданий (CRUD + управление)
│   │   └── phone_service.py     # Бизнес-логика телефонов (сохранение, выдача, пометка)
│   ├── scheduler.py             # APScheduler: запуск заданий по расписанию
│   └── mcp_server.py            # FastMCP: 9 инструментов для CRM
├── cli.py                       # Click CLI (serve, task, phones, status)
├── main.py                      # Entrypoint: scheduler + MCP stdio в одном event loop
├── alembic.ini
├── alembic/
│   ├── env.py
│   └── versions/
│       └── 001_initial.py       # Первая миграция: tasks, listings, phones
├── Dockerfile
├── docker-compose.yml           # postgres + bot
├── requirements.txt
└── docs/specs/2026-06-07-krisha-bot.md
```

---

## Схема зависимостей между модулями

```
main.py
  ├── scheduler.py  →  task_service.py  →  database.py / models.py
  │                →  krisha.py         →  human.py
  │                →  phone_service.py  →  database.py / models.py
  └── mcp_server.py →  task_service.py
                    →  phone_service.py

cli.py  →  task_service.py / phone_service.py / scheduler.py
```

Сервисный слой (`task_service`, `phone_service`) — единственное место с бизнес-логикой.
MCP и CLI обращаются только к сервисам, не к моделям напрямую.

---

## Как работает event loop

```
asyncio event loop
  ├── APScheduler AsyncIOScheduler   ← фоновые задания парсинга
  └── FastMCP.run_stdio_async()      ← читает stdin, отвечает в stdout
```

Оба компонента живут в одном asyncio event loop. Парсинг запускается как
`asyncio.create_task()` из планировщика, не блокируя MCP.

---

## Пошаговый план реализации

### Шаг 1 — Скаффолд проекта
- [x] Создать структуру директорий
- [x] `requirements.txt` с зафиксированными версиями
- [x] `.gitignore`, `.env.example`
- [x] alembic config

### Шаг 2 — БД: модели и миграция
- [x] `bot/database.py`
- [x] `bot/models.py`
- [x] `alembic/versions/001_initial.py`

### Шаг 3 — Имитация человека (`human.py`)
- [x] User-Agent пул, random delays, build_session()

### Шаг 4 — Парсер krisha.kz (`krisha.py`)
- [x] `iter_listing_urls` — пагинация + задержки
- [x] `fetch_phones` — сессия + ajaxPhones
- [x] Нормализация номера
- [x] `playwright_fb.py` — fallback

### Шаг 5 — Сервисный слой
- [x] `task_service.py`
- [x] `phone_service.py`

### Шаг 6 — Планировщик (`scheduler.py`)
- [x] AsyncIOScheduler, load_active_tasks, run_task, schedule/unschedule

### Шаг 7 — MCP-сервер (`mcp_server.py`)
- [x] FastMCP, 9 инструментов

### Шаг 8 — CLI (`cli.py`) + main.py
- [x] Click CLI, все команды
- [x] main.py entrypoint

### Шаг 9 — Docker Compose
- [x] Dockerfile
- [x] docker-compose.yml

### Шаг 10 — Smoke-тест
- [x] `docker compose up -d` — контейнеры стартуют, Postgres healthy
- [x] Alembic-миграции применяются автоматически при старте
- [x] `cli task add / list / status` — работает
- [x] Сервисный слой: создание заданий, статистика — работает
- [x] Парсинг страницы поиска — 40 объявлений на странице, regex работает
- [x] Azure Key Vault: секреты сохранены (krisha-bot--prod--KRISHA-LOGIN/PASSWORD)
- [x] scripts/start-dev.sh — читает KV, передаёт env vars в runtime
- [x] Авторизация: POST id.kolesa.kz/login.json с паролем → Playwright следует JS-редиректу → krisha.kz cookies
- [x] Телефоны: ajaxPhones отдаёт реальные номера с авторизованной сессией (проверено локально)
- [x] Куки сохранены в Key Vault: krisha-bot--prod--KRISHA-SESSION-COOKIES
- [x] scripts/save-session.py — полностью автоматический рефреш сессии

### Следующие шаги
1. Запустить бот в Docker с реальными задачами (smoke-тест парсинга в контейнере)
2. Добавить auto-refresh сессии: если ajaxPhones вернул ошибку/captcha — вызвать save-session.py

---

## Версии зависимостей (зафиксировать в requirements.txt)

| Пакет | Версия |
|---|---|
| sqlalchemy | 2.0.x |
| alembic | 1.13.x |
| asyncpg | 0.29.x |
| requests | 2.32.x |
| beautifulsoup4 | 4.12.x |
| lxml | 5.x |
| playwright | 1.44.x |
| apscheduler | 3.10.x |
| mcp | 1.x (FastMCP) |
| click | 8.1.x |
| python-dotenv | 1.0.x |

---

# Plan (фича): Браузерный показ телефона + reCAPTCHA

**ТЗ:** [docs/specs/2026-06-07-browser-phone-reveal.md](docs/specs/2026-06-07-browser-phone-reveal.md)
**Статус:** [x] ГОТОВО. Гейты 1-4 + живой тест пройдены. Код + 14 тестов (зелёные).
Живой прогон 2026-06-07 на 1 объявлении через KZ-туннель: телефон ПОЛУЧЕН
(страница → ajaxPhones → gRecaptcha v2 → 2captcha → gRecaptchaResponse → phone).
Подтверждено: v2-токена в `gRecaptchaResponse` достаточно, отдельный v3Token НЕ нужен.
Важно: 2captcha ходит НАПРЯМУЮ (мимо KZ-туннеля) — иначе TLS рвётся (`_no_proxy_env`).
Остаётся ops: положить ключ 2captcha в Key Vault (сейчас тест шёл с env-ключом).

## Почему отдельный план
krisha ввёл site-wide reCAPTCHA на `ajaxPhones`. Переходим на единый Playwright-поток
(обход выдачи + показ телефона) с обработкой reCAPTCHA: browser-native → 2captcha fallback.

## Открытые решения (резолв на этом гейте)
- **Headless vs headful:** старт — `headless` + stealth-эвейжены (скрыть `navigator.webdriver`,
  реалистичный UA/locale, `channel="chrome"` если доступен). Если reCAPTCHA-скоринг низкий и
  browser-native стабильно не проходит → эскалация на headful + `xvfb` в Docker.
  *Рекомендация:* headless+stealth (легче для 24/7), эскалация по факту.
- **Legacy `krisha.py` / `playwright_fb.py`:** НЕ удаляем. Чистые парс-хелперы
  (`_parse_listing_urls`, `_extract_advert_id`, `_has_next_page`, `normalize_phone`)
  переиспользуем импортом из `browser.py`. Старый requests-путь остаётся как референс/легаси.
- **Механика 2captcha-инъекции:** зависит от того, КАК krisha передаёт токен в reveal
  (param в ajaxPhones? callback grecaptcha?). Неизвестно → **discovery-спайк (Шаг 0)**.

## Архитектура потока
```
scheduler.run_task → browser.parse_task(task_url, account_cookies, proxy)
  launch Chromium (KZ-proxy socks5://, cookies аккаунта, stealth)
  enumerate выдачи (goto search?page=N, парс advert_id, пауза 2-5с, пагинация)
  для каждого НОВОГО объявления (проверка в БД):
     goto /a/show/<id>  (пауза 1-3с, «чтение»)
     reveal_phone(page, advert_id):
        click «показать телефон»
        перехват ответа ajaxPhones
        если телефон есть → return (browser-native прошёл)
        если gRecaptcha → recaptcha.solve_and_retry(page) → 2captcha → retry reveal
     save_phones(БД)
  на устойчивом провале → ротация аккаунта (как сейчас)
```

## Пошаговый план

### Шаг 0 — Discovery-спайк (ОБЯЗАТЕЛЬНО до кодинга solver)
Цель: снять точные параметры reCAPTCHA на 1 объявлении (после капча-кулдауна ≥5 мин).
- [ ] Браузерный заход на 1 listing через KZ-прокси с куками аккаунта
- [ ] Зафиксировать: проходит ли reCAPTCHA сама в реальном браузере (browser-native happy path?)
- [ ] Если челлендж: снять **sitekey**, **версию** (v2 invisible / v2 checkbox / v3 + action),
      и **как токен уходит в reveal** (param в ajaxPhones / callback / форма)
- [ ] Записать находки сюда, в plan.md → они грундят Шаги 2-3
- [ ] Строго 1 объявление, без серий (правило имитации человека)
**Если browser-native проходит сам → 2captcha-fallback можно отложить (упрощение).**

#### НАХОДКИ Шага 0 (выполнено 2026-06-07, 1 объявление)
krisha использует каскад **reCAPTCHA v3 → v2 fallback**:
- **Этап 1 (v3, invisible):** браузер САМ генерит токен и шлёт `GET /a/ajaxPhones?id=<id>&v3Token=<token>`.
  v3 sitekey = `6LfUM0ssAAAAAA5Crt1T3YwFsK5XhKDFss9Tn6s4`. Механически browser-native работает.
- **Этап 2 (v2, fallback):** при низком v3-скоринге сервер отвечает
  `{"phones": [], "gRecaptcha": {"scriptUrl": ".../api.js", "siteKey": "6Lc2jVAsAAAAAAuCnHxH_tVwR3yYoAX-1rXBHTjn"}}`
  и требует решить **v2 (size=normal)**. Рендер: `api.js?onload=krRecaptchaInit&render=explicit`.
- В headless v3-скоринг низкий → **всегда падаем в v2** → solver обязателен (не отложить).
- enterprise=False. Два разных sitekey: v3 для скоринга, v2 для челленджа.
- **РЕШЕНО чтением krisha-JS (main-vendor.js):** показ телефона — чистый токен-based API.
  `fetchPhones()` строит `GET /a/ajaxPhones?id=<id>&v3Token=<v3>&gRecaptchaResponse=<v2>`.
  - v3-токен: `grecaptcha.execute(siteKey="6LfUM0ss...", action="ajaxPhones")` → param `v3Token`.
  - v2-fallback: сервер вернул `gRecaptcha.siteKey="6Lc2jVAs..."`, виджет `grecaptcha.render`,
    callback кладёт токен в стор, резубмит шлёт его как param **`gRecaptchaResponse`**.
  - phonesUrl из конфига страницы: `/a/ajaxPhones?id=<id>`.
  Вывод: **браузер для reveal НЕ обязателен** — достаточно решить v2 через 2captcha и передать
  `gRecaptchaResponse`. Это сильно упрощает реализацию vs инъекция токена в Vue/grecaptcha.

#### Резолв стратегии после находок
- Основной путь: **2captcha решает v2-fallback** (sitekey `6Lc2jVAs...`, тип v2/normal, pageurl листинга).
- v3 оставляем browser-native (вдруг иногда пройдёт сам → бесплатно); при `gRecaptcha` в ответе
  → переключаемся на v2-solver.
- Опционально позже: headful+xvfb для подъёма v3-скоринга (снизит частоту платных solve).

#### АРХИТЕКТУРНОЕ РЕШЕНИЕ (утв. пользователем): HTTP + 2captcha
API чистый токен-based → **браузер для reveal не нужен**. Остаёмся на requests-потоке,
капчу решаем inline через 2captcha. Браузерный путь (`playwright_fb.py`) — опциональный fallback.

**Новый flow `fetch_phones` (в `krisha.py`):**
1. GET страницы объявления (cookies, как сейчас).
2. GET `/a/ajaxPhones?id=<id>` → ответ JSON.
3. Если `phones` есть → готово (browser-native/без капчи — бесплатно).
4. Если `gRecaptcha` (v2-челлендж): взять `siteKey` из ответа, `solve_v2(siteKey, pageurl)`
   через 2captcha → токен. GET `/a/ajaxPhones?id=<id>&gRecaptchaResponse=<token>` → `phones`.
5. Если снова `gRecaptcha`/нет телефона → CaptchaError → ротация аккаунта (как сейчас).

**Упрощение vs первоначальный план:** НЕ создаём `browser.py`, НЕ переписываем enumerate.
Меняем только reveal в `krisha.py` + новый `recaptcha.py` (2captcha solver) + `secrets.py`.

### Шаг 1 — Зависимости и секрет
- [ ] `2captcha-python` в requirements.txt (пин версии) — на подтверждение пользователю
- [ ] `bot/secrets.py`: `get_twocaptcha_key()` ← KV `krisha-bot--prod--TWOCAPTCHA-API-KEY`
- [ ] Положить ключ 2captcha в Key Vault (ручной ops-шаг пользователя)

### Шаг 2 — `bot/parser/recaptcha.py` (новый, 2captcha v2 solver)
- [ ] `solve_v2(site_key, page_url) -> str` — решение reCAPTCHA v2 через 2captcha SDK,
      ключ из `secrets.get_twocaptcha_key()`. Таймаут/ошибка → исключение.
- [ ] `Solver2CaptchaError` — для проброса в ротацию аккаунта.
- [ ] Ленивая инициализация клиента (ключ из KV только когда реально нужен solve).

### Шаг 3 — `bot/parser/krisha.py` (правка reveal, БЕЗ браузера)
- [ ] `_fetch_phones_sync`: после GET ajaxPhones — если в ответе `gRecaptcha` и нет `phones`:
      взять `siteKey` из `gRecaptcha`, `solve_v2(siteKey, listing_url)` → токен,
      повторный GET `ajaxPhones?id=<id>&gRecaptchaResponse=<token>`.
- [ ] Если и после решения капчи телефонов нет / снова `gRecaptcha` → `CaptchaError`.
- [ ] Аккуратные паузы сохранить; не долбить (имитация человека).
- [ ] `playwright_fb.py` остаётся опциональным fallback (без изменений).

### Шаг 4 — scheduler (минимальная правка)
- [ ] Логика `run_task` остаётся (requests-поток + ротация аккаунтов при `CaptchaError`).
- [ ] Проверить: после inline-решения капчи ротация срабатывает только при реальном провале.
- [ ] `cli task run <id>` — путь проверки на 1 объявлении (нужен ключ 2captcha в KV).

### Шаг 5 — Гейт 4: ревью + тесты
- [ ] subagent `reviewer` → правки
- [ ] subagent `tester` → ключевые сценарии (юнит на detect/inject с моками; флоу с моком страницы)
- [ ] Ручной клик-тест пользователем: `cli task run` на 1 объявлении через KZ-прокси

## Зависимости (новые, пин — на подтверждение)
| Пакет | Версия | Зачем |
|---|---|---|
| 2captcha-python | 2.0.7 | решение reCAPTCHA v2 (последняя стабильная; API `recaptcha()`→`{"code"}` совместим) |

## Риски
- **Headless reCAPTCHA-скоринг** низкий → browser-native не проходит. Митигация: stealth,
  доверенные cookies, KZ-IP; эскалация на headful+xvfb.
- **Механика инъекции** site-specific → Шаг 0 снимает неопределённость до кода.
- **Стоимость 2captcha** при частых челленджах → сначала browser-native, solver только при провале.
- **Капча-кулдаун** ограничивает отладку → тестим по 1 объявлению с паузами.

---

# Plan (фича): Справочник krisha.kz (гео + категории + фильтры)

**ТЗ:** [docs/specs/2026-06-07-krisha-geo-mapping.md](docs/specs/2026-06-07-krisha-geo-mapping.md)
**Статус:** [ ] Гейт 2 — план на согласовании

## Принципы (из ТЗ — жёстко)
- Старт ТОЛЬКО после завершения текущего парса (`besagash_phones.csv`).
- Минимум запросов к krisha, строго последовательно, паузы как человек, через KZ-туннель.
- Найти ЕДИНЫЙ источник гео-дерева; НЕ краулить по регионам. Каждый запрос — лог N/total.

## Формат артефактов
`docs/krisha-reference/`:
- `geo.json` — плоский список узлов: `{id, name, slug, type, parent_id, url_path}`
  (type ∈ region|city|district|settlement). Плоский + parent_id = просто и запрашиваемо.
- `categories.json` — `{slug, name}` (prodazha/kvartiry, arenda-dolgosrochnaya/kvartiry, ...).
- `filters.json` — схема `das[...]`: param → {тип, enum-значения, синтаксис} (комнаты `[]`/`N.100`,
  тип дома 1/2/3, who, price, year, square, ...). Источник — выверенная память + форма фильтра.
- `README.md` — как пользоваться, дата снимка, источник, сколько запросов потрачено.

## Пошаговый план

### Шаг 0 — Дождаться конца парса
- [ ] Парс `b4cs2620i` завершён, `besagash_phones.csv` готов, чистый список выдан.
      До этого — НИ ОДНОГО запроса к krisha по справочнику.

### Шаг 1 — Поиск единого источника (бережно, последовательно, с паузами)
Кандидаты по очереди, остановиться на первом достаточном:
- [ ] `GET /robots.txt` → найти ссылку(и) на sitemap.
- [ ] `GET /sitemap.xml` (или индекс) → есть ли карта гео/категорий URL.
- [ ] Если sitemap не даёт дерево с slug+id: проверить JS-бандл (`main-vendor`/`main-common`,
      уже известны) ИЛИ ajax-автокомплит региона — найти embedded region tree (id+slug+parent).
- [ ] Зафиксировать источник и сколько запросов ушло (лог N/total).
**Если единого источника нет → сузить охват (см. границы ТЗ), НЕ краулить.**

### Шаг 2 — Парсинг источника → geo.json
- [ ] Распарсить дерево: регионы → города/районы → нас.пункты (name, slug, geo-id, parent, url_path).
- [ ] Проверка: Бесагаш присутствует и `slug=besagash-dzerzhinskoe`, путь корректен.

### Шаг 3 — categories.json + filters.json
- [ ] Категории: из sitemap/источника + известные пути.
- [ ] Фильтры: перенести выверенную схему `das[...]` из памяти `tech_krisha_filters`
      (корректный синтаксис комнат `[]`/`N.100`, who, price, year, building, square...).
      Запросы к krisha НЕ нужны (данные уже есть).

### Шаг 4 — README + скрипт обновления
- [ ] `docs/krisha-reference/README.md`: использование, дата снимка, источник, счётчик запросов.
- [ ] `scripts/build-krisha-map.py` — бережно тянет тот же единый источник и пересобирает json
      (для ручного рефреша; авто — вне итерации).

### Шаг 5 — Память + Гейт 4
- [ ] Обновить память `tech_krisha_filters` → ссылка на `docs/krisha-reference/` как источник правды.
- [ ] `reviewer`: корректность JSON-схемы, нет ли краулинга, соответствие ТЗ.
- [ ] `tester`: JSON валиден, Бесагаш корректен, схема фильтров сходится с памятью,
      число запросов к krisha минимально (по логу).

## Риски
- **Нет единого источника** → fallback: только регионы + дети из одного источника, лог пропусков.
- **Огромный sitemap** → брать индекс, тянуть только гео/категорийную карту, не всё подряд.
- **Объём нас.пунктов КЗ** → хранить компактно (плоский json), при необходимости по регионам-файлам.
