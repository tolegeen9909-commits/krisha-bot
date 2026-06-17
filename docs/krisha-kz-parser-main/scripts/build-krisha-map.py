#!/usr/bin/env python3
"""Бережная сборка справочника krisha.kz (гео-дерево) из ЕДИНОГО источника (sitemap).

Принципы (docs/specs/2026-06-07-krisha-geo-mapping.md, память feedback-minimize-krisha-probing):
  - Минимум запросов, строго последовательно, человеческие паузы.
  - Единый источник: robots.txt -> sitemap.xml -> sitemap/frontend/search*.xml. НЕ краулим по регионам.
  - Каждый запрос логируется N/total. Жёсткий потолок MAX_REQUESTS. Только через KZ-туннель.

Запуск (туннель обязателен — иначе krisha таймаутит с не-KZ IP):
  ALL_PROXY=socks5h://127.0.0.1:1080 HTTPS_PROXY=socks5h://127.0.0.1:1080 \
    python3 scripts/build-krisha-map.py --discover   # показать структуру sitemap
    python3 scripts/build-krisha-map.py --build       # собрать docs/krisha-reference/geo.json
"""
import argparse
import json
import os
import random
import re
import sys
import time

import requests

BASE = "https://krisha.kz"
SEARCH_FILES = ["search.xml", "search_2.xml", "search_3.xml", "search_4.xml"]
MAX_REQUESTS = 30
GEO_JSON = os.path.join(os.path.dirname(__file__), "..", "docs", "krisha-reference", "geo.json")
_UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
       "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")

# Сегменты, которые НЕ являются гео (типы сделки/недвижимости/служебное).
BLOCK = {
    "doma-dachi", "doma-dachi-posutochno", "kommercheskaya-nedvizhimost", "komnaty",
    "kvartiry", "kvartiry-po-chasam", "kvartiry-posutochno", "prombazy", "vozmu-v-arendu",
    "biznes", "garazhi", "uchastkov", "zarubezhnoj-nedvizhimosti", "map", "prodazha", "arenda",
}
FOREIGN_CAT = "prodazha/zarubezhnoj-nedvizhimosti"

# Проверенные вручную узлы (имена кириллицей, точно рабочие url_path). Единая схема полей.
SEED = [
    {"name": "Алматы", "slug": "almaty", "type": "city", "url_path": "almaty", "parent_url_path": None},
    {"name": "Астана", "slug": "astana", "type": "city", "url_path": "astana", "parent_url_path": None},
    {"name": "Шымкент", "slug": "shymkent", "type": "city", "url_path": "shymkent", "parent_url_path": None},
    {"name": "Алматинская область", "slug": "almatinskaya-oblast", "type": "region",
     "url_path": "almatinskaya-oblast", "parent_url_path": None},
    {"name": "Талгар", "slug": "talgar", "type": "city",
     "url_path": "almatinskaya-oblast/talgar", "parent_url_path": "almatinskaya-oblast"},
    {"name": "Талгарский район", "slug": "talgarskij-rajon", "type": "district",
     "url_path": "almatinskaya-oblast/talgarskij-rajon", "parent_url_path": "almatinskaya-oblast"},
    {"name": "Бесагаш (Дзержинское)", "slug": "besagash-dzerzhinskoe", "type": "settlement",
     "url_path": "besagash-dzerzhinskoe", "parent_url_path": "almatinskaya-oblast/talgarskij-rajon",
     "note": "krisha.kz/prodazha/kvartiry/besagash-dzerzhinskoe/ — без префикса региона; parent справочный"},
]

_count = {"n": 0}


def _require_proxy():
    if not (os.environ.get("ALL_PROXY") or os.environ.get("HTTPS_PROXY")):
        print("ОШИБКА: не задан ALL_PROXY/HTTPS_PROXY. krisha доступен только через KZ-туннель.\n"
              "Запусти: ALL_PROXY=socks5h://127.0.0.1:1080 HTTPS_PROXY=socks5h://127.0.0.1:1080 ...",
              file=sys.stderr)
        sys.exit(2)


def _session():
    s = requests.Session()
    s.headers.update({"User-Agent": _UA, "Accept-Language": "ru-RU,ru;q=0.9"})
    return s  # прокси из env


def fetch(s, url, total):
    if _count["n"] >= MAX_REQUESTS:
        raise RuntimeError(f"достигнут потолок MAX_REQUESTS={MAX_REQUESTS}")
    _count["n"] += 1
    print(f"[{_count['n']}/{total}] GET {url}", flush=True)
    r = s.get(url, timeout=40)
    time.sleep(random.uniform(2.0, 5.0))  # человеческая пауза
    return r.text if r.status_code == 200 else ""


def discover(s):
    robots = fetch(s, f"{BASE}/robots.txt", "discover")
    sitemaps = re.findall(r"(?im)^\s*Sitemap:\s*(\S+)", robots)
    print("\nSitemap из robots.txt:", *("  " + u for u in sitemaps), sep="\n")
    for sm in sitemaps:
        body = fetch(s, sm, "discover")
        locs = re.findall(r"<loc>\s*([^<\s]+)\s*</loc>", body)
        print(f"\n{sm} ({'индекс' if '<sitemapindex' in body else 'карта'}, {len(locs)} loc):")
        for u in locs[:25]:
            print("   ", u)


def _is_geo(path):
    for seg in path.split("/"):
        if seg in BLOCK or seg.startswith("typi-") or "%" in seg or seg.startswith("das["):
            return False
    return True


def _node_type(path):
    last = path.split("/")[-1]
    if last.endswith("-oblast"):
        return "region"
    if last.endswith("-rajon") or last.endswith("-rayon"):
        return "district"
    return "city_or_settlement"


def build(s):
    geo_cats = {}  # url_path -> set(категорий, где встретился)
    for i, f in enumerate(SEARCH_FILES):
        body = fetch(s, f"{BASE}/sitemap/frontend/{f}", f"{len(SEARCH_FILES)} search")
        for u in re.findall(r"<loc>\s*([^<\s]+)\s*</loc>", body):
            u = u.split("?")[0]
            p = re.sub(r"^https?://krisha\.kz/", "", u).strip("/").split("/")
            if len(p) < 3:
                continue
            cat, geo = "/".join(p[:2]), "/".join(p[2:])
            if _is_geo(geo):
                geo_cats.setdefault(geo, set()).add(cat)
        print(f"    накоплено гео: {len(geo_cats)}", flush=True)

    nodes_by_path = {}
    for path, cats in sorted(geo_cats.items()):
        segs = path.split("/")
        is_country = cats == {FOREIGN_CAT}
        nodes_by_path[path] = {
            "name": segs[-1].replace("-", " ").replace("_", " ").capitalize(),
            "slug": segs[-1],
            "type": "country" if is_country else _node_type(path),
            "url_path": path,
            "parent_url_path": "/".join(segs[:-1]) if len(segs) > 1 else None,
            "verified": False,
            "in_sitemap": True,
            "name_source": "derived-from-slug",
        }
    # мердж проверенного seed (единая схема, seed побеждает по своему url_path)
    for sd in SEED:
        n = dict(sd)
        n["verified"] = True
        n["name_source"] = "manual"
        n["in_sitemap"] = sd["url_path"] in nodes_by_path
        nodes_by_path[n["url_path"]] = n

    nodes = sorted(nodes_by_path.values(), key=lambda n: n["url_path"])
    out = {
        "_meta": {
            "description": "Гео-дерево krisha.kz из sitemap (search*.xml, query срезан). Единая схема узлов.",
            "captured_at": "2026-06-07",
            "source": "https://krisha.kz/sitemap/frontend/search{,_2,_3,_4}.xml",
            "requests_to_krisha": _count["n"],
            "status": "from-sitemap-cleaned",
            "node_count": len(nodes),
            "node_fields": "name | slug | type | url_path | parent_url_path | verified | in_sitemap | name_source",
            "url_path_rule": "url_path САМОДОСТАТОЧЕН (полный путь после категории). parent_url_path — справочная иерархия, url_path из неё НЕ выводится (напр. besagash-dzerzhinskoe без префикса региона).",
            "coverage_note": "Покрытие = регионы (-oblast) и города/районы, проиндексированные krisha в sitemap. Отфильтрованы типы недвижимости/typi-*/das-комбо. Зарубежные направления помечены type=country. ГРАНУЛЯРНЫЕ СЁЛА могут отсутствовать (besagash-dzerzhinskoe в sitemap НЕ был — из verified seed). Для отсутствующих — url_path из адресной строки браузера (feedback-minimize-krisha-probing).",
            "lookup_note": "Ключ — url_path (уникален). Один slug может встречаться с разными url_path (напр. talgar и almatinskaya-oblast/talgar) — это разные валидные пути.",
        },
        "nodes": nodes,
    }
    with open(GEO_JSON, "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, indent=2)

    regions = [n["url_path"] for n in nodes if n["type"] == "region"]
    countries = [n["url_path"] for n in nodes if n["type"] == "country"]
    print(f"\nИтого: {len(nodes)} узлов | регионов {len(regions)} | стран {len(countries)} | запросов {_count['n']}")
    print("Бесагаш:", [n["url_path"] for n in nodes if "besagash" in n["url_path"]])
    print("записано:", os.path.normpath(GEO_JSON))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--discover", action="store_true", help="показать структуру sitemap")
    ap.add_argument("--build", action="store_true", help="собрать geo.json из search*.xml")
    args = ap.parse_args()
    _require_proxy()
    s = _session()
    try:
        if args.build:
            build(s)
        elif args.discover:
            discover(s)
            print(f"\nЗапросов к krisha: {_count['n']}")
        else:
            print("Укажи --discover или --build.", file=sys.stderr)
            sys.exit(2)
    except Exception as exc:
        print(f"Остановлено: {exc} (запросов: {_count['n']})", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
