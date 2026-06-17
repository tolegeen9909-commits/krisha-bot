# Справочник krisha.kz

Переиспользуемый справочник для построения поисковых URL krisha.kz **без перебора/угадывания**
(см. урок `feedback-minimize-krisha-probing`). Источник правды для гео, категорий и фильтров.

**Дата снимка:** 2026-06-07
**Статус:** `geo.json` — собран из sitemap (search*.xml) + 7 проверенных seed-узлов. **68 узлов:
17 регионов, 14 зарубежных направлений (`type: country`), остальное — города/нас.пункты.**
Воспроизводится: `python3 scripts/build-krisha-map.py --build` (4 запроса к krisha, через туннель).

⚠️ **Покрытие неполное:** sitemap индексирует регионы и города/районы, но **НЕ все мелкие сёла**.
Например `besagash-dzerzhinskoe` в sitemap отсутствовал — добавлен из проверенного вручную seed
(`verified: true, in_sitemap: false`). **Для отсутствующих гранулярных нас.пунктов — брать
`url_path` из адресной строки браузера** (см. `feedback-minimize-krisha-probing`), не угадывать.

## Файлы

| Файл | Содержимое |
|---|---|
| `geo.json` | 68 узлов, единая схема: `name, slug, type, url_path, parent_url_path, verified, in_sitemap, name_source` (+ `note` у части). Ключ — `url_path` (уникален); `parent_url_path` справочный, `url_path` из него не выводится. |
| `categories.json` | Категории (`prodazha/kvartiry`, `arenda/kvartiry`, `prodazha/doma-dachi`, ...) |
| `filters.json` | Схема `das[...]` + enum-значения (комнаты `[]`/`N.100`, тип дома, who, price, year, ...) |

**Поля `geo.json`:** `verified: true` — узел проверен вручную (имя кириллицей, точно рабочий
`url_path`); `verified: false` + `name_source: derived-from-slug` — из sitemap, имя выведено из
slug (приблизительно). Транслитерация в sitemap может отличаться (`almatinskaja` vs проверенный
`almatinskaya`) — для verified-узлов используй их `url_path`.

## Как построить URL

```
https://krisha.kz/{category.slug}/{geo.url_path}/?{das-фильтры}
```

- `category.slug` — из `categories.json`.
- `geo.url_path` — из `geo.json` (НЕ угадывать slug!). Внимание: у нас.пунктов путь может быть
  БЕЗ префикса региона (напр. Бесагаш = `besagash-dzerzhinskoe`, без `almatinskaya-oblast/`).
- фильтры — по `filters.json` (массивы через `[]`, «N и более» = `N.100`).

Пример (Бесагаш, продажа квартир, 3+ комн., 50–75 млн, от 2023, хозяева):
```
https://krisha.kz/prodazha/kvartiry/besagash-dzerzhinskoe/
  ?das[house.year][from]=2023
  &das[live.rooms][]=3&das[live.rooms][]=4&das[live.rooms][]=5.100
  &das[price][from]=50000000&das[price][to]=75000000&das[who]=1
```

## Проверка валидности

Неверный путь у krisha отдаёт HTTP 404 со страницей `error-content__title` + блок `hot-list`
(случайные объявления по всему КЗ — НЕ результаты фильтра). Перед парсингом убедиться, что в
HTML нет `error-content__title`.

## Обновление

```
ALL_PROXY=socks5h://127.0.0.1:1080 HTTPS_PROXY=socks5h://127.0.0.1:1080 \
  python3 scripts/build-krisha-map.py --build      # пересобрать geo.json (4 запроса)
  python3 scripts/build-krisha-map.py --discover   # показать структуру sitemap
```

Скрипт бережный: последовательно, паузы 2-5с, жёсткий потолок `MAX_REQUESTS=30`, лог `N/total`,
требует прокси-env (иначе выход — krisha доступен только через KZ-туннель), без краулинга по регионам.
