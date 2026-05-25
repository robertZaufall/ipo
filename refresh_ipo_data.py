#!/usr/bin/env python3
"""
Refresh the static IPO page data.

The script uses the StockAnalysis stock screener, IPO lists, and ticker
metadata, keeps the top symbols with market cap at or above the configured
threshold, and writes:

- ipo-data.js: card metadata
- chart-data.js: first-trading-day Yahoo Finance 5-minute OHLCV bars
- ipo-analysis.js: derived first-day low timing analysis

Dependencies: Python 3.11+ standard library only.
"""
from __future__ import annotations

import argparse
import datetime as dt
import html
import json
import math
import pathlib
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from html.parser import HTMLParser
from zoneinfo import ZoneInfo


BASE_URL = "https://stockanalysis.com"
SCREENER_URL = f"{BASE_URL}/stocks/screener/"
YAHOO_CHART_BASE = "https://query1.finance.yahoo.com/v8/finance/chart"
ET = ZoneInfo("America/New_York")
UTC = dt.timezone.utc
DEFAULT_INTERVAL = "5m"
DEFAULT_THRESHOLD_B = 25.0
DEFAULT_YEAR = dt.date.today().year
DEFAULT_START_YEAR = DEFAULT_YEAR
DEFAULT_END_YEAR = 2019
DEFAULT_LIMIT = 25
DEFAULT_CANDIDATE_LIMIT = 300
DEFAULT_RECENT_AFTER_YEAR = 2020
DEFAULT_INCLUDE_TICKERS = ["CBRS"]
DEFAULT_EXCLUDE_TICKERS = ["VG"]
DEFAULT_MIN_START_PRICE = 1.0

PRICING_RELEASES = {
    "CBRS": "https://www.cerebras.ai/press-release/cerebras-systems-announces-pricing-of-initial-public-offering",
}


class IPOListParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.rows: list[tuple[list[str], list[tuple[str, str]]]] = []
        self._in_tr = False
        self._in_cell = False
        self._cell = ""
        self._row: list[str] = []
        self._links: list[tuple[str, str]] = []
        self._link_href: str | None = None
        self._link_text = ""

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attr = dict(attrs)
        if tag == "tr":
            self._in_tr = True
            self._row = []
            self._links = []
        if self._in_tr and tag in {"td", "th"}:
            self._in_cell = True
            self._cell = ""
        if self._in_cell and tag == "a":
            self._link_href = attr.get("href")
            self._link_text = ""

    def handle_data(self, data: str) -> None:
        if self._in_cell:
            self._cell += data
        if self._link_href:
            self._link_text += data

    def handle_endtag(self, tag: str) -> None:
        if tag == "a" and self._link_href:
            self._links.append((self._link_href, squish(self._link_text)))
            self._link_href = None
            self._link_text = ""
        if tag in {"td", "th"} and self._in_cell:
            self._row.append(squish(self._cell))
            self._in_cell = False
        if tag == "tr" and self._in_tr:
            if self._row:
                self.rows.append((self._row, self._links))
            self._in_tr = False


def squish(value: str) -> str:
    return " ".join(html.unescape(value).split())


def strip_tags(fragment: str) -> str:
    fragment = re.sub(r"<!--.*?-->", "", fragment, flags=re.S)
    fragment = re.sub(r"<.*?>", "", fragment, flags=re.S)
    return squish(fragment)


def fetch_text(url: str, *, accept: str = "text/html") -> str:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (compatible; IPODataBuilder/1.0)",
            "Accept": accept,
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8", "replace")


def fetch_json(url: str) -> dict:
    return json.loads(fetch_text(url, accept="application/json,text/plain,*/*"))


def parse_js_string(value: str) -> str:
    try:
        return html.unescape(json.loads(f'"{value}"'))
    except json.JSONDecodeError:
        return html.unescape(value.replace(r"\"", '"').replace(r"\\", "\\"))


def stockanalysis_url(ticker: str, suffix: str = "") -> str:
    slug = urllib.parse.quote(ticker.lower(), safe=".")
    return f"{BASE_URL}/stocks/{slug}/{suffix}"


def normalize_ticker(ticker: str) -> str:
    ticker = ticker.strip().upper()
    return "CBRS" if ticker == "CRBS" else ticker


def yahoo_symbol(ticker: str) -> str:
    return ticker.replace(".", "-")


def parse_us_date(value: str) -> str:
    return dt.datetime.strptime(value, "%b %d, %Y").date().isoformat()


def parse_money(value: str | None) -> float | None:
    if not value:
        return None
    value = value.strip()
    if value in {"-", "n/a", "N/A"}:
        return None
    match = re.search(r"-?[\d,.]+", value)
    if not match:
        return None
    out = float(match.group(0).replace(",", ""))
    return out if math.isfinite(out) else None


def parse_percent(value: str | None) -> float | None:
    if not value or value.strip() in {"-", "n/a", "N/A"}:
        return None
    return parse_money(value.replace("%", ""))


def parse_market_cap_b(value: str | None) -> float | None:
    if not value:
        return None
    clean = value.replace("$", "").replace(",", "").strip()
    match = re.match(r"(-?[\d.]+)\s*([KMBT]?)", clean, re.I)
    if not match:
        return None
    amount = float(match.group(1))
    suffix = match.group(2).upper()
    scale = {"": 1 / 1_000_000_000, "K": 1 / 1_000_000, "M": 1 / 1_000, "B": 1, "T": 1_000}
    return amount * scale[suffix]


def parse_row_value(page: str, label: str) -> str | None:
    for match in re.finditer(re.escape(label), page):
        start = page.rfind("<tr", 0, match.start())
        end = page.find("</tr>", match.end())
        if start < 0 or end < 0:
            continue
        cells = [strip_tags(cell) for cell in re.findall(r"<td[^>]*>(.*?)</td>", page[start:end], re.S)]
        if len(cells) >= 2 and cells[0] == label:
            return cells[1]
    return None


def parse_current_price(page: str) -> float | None:
    match = re.search(r'<div class="text-4xl[^"]*">([^<]+)</div>', page)
    return parse_money(match.group(1)) if match else None


def parse_ipo_list(year: int) -> list[dict]:
    url = f"{BASE_URL}/ipos/{year}/"
    page = fetch_text(url)
    parser = IPOListParser()
    parser.feed(page)
    items = []
    for row, links in parser.rows:
        if len(row) < 6 or not links:
            continue
        if not re.match(r"^[A-Z][a-z]{2} \d{1,2}, \d{4}$", row[0]):
            continue
        ticker_link = next((href for href, text in links if text == row[1]), links[0][0])
        items.append(
            {
                "ticker": row[1].upper(),
                "name": row[2],
                "date": parse_us_date(row[0]),
                "ipoPrice": parse_money(row[3]),
                "current": parse_money(row[4]),
                "dayChange": parse_percent(row[5]),
                "detailUrl": urllib.parse.urljoin(BASE_URL, ticker_link),
                "listUrl": url,
            }
        )
    return items


def parse_ipo_lists(start_year: int, end_year: int) -> list[dict]:
    items: list[dict] = []
    step = -1 if start_year >= end_year else 1
    for year in range(start_year, end_year + step, step):
        try:
            rows = parse_ipo_list(year)
        except urllib.error.HTTPError as exc:
            print(f"warning: StockAnalysis IPO list {year} failed: {exc}", file=sys.stderr)
            continue
        print(f"Fetched {len(rows)} IPO rows from StockAnalysis {year}.")
        items.extend(rows)
    deduped: dict[str, dict] = {}
    for item in items:
        deduped.setdefault(item["ticker"], item)
    return list(deduped.values())


def parse_stock_screener(threshold_b: float, candidate_limit: int) -> list[dict]:
    page = fetch_text(SCREENER_URL)
    pattern = re.compile(
        r'\{s:"(?P<ticker>[^"]+)",'
        r'n:"(?P<name>(?:\\.|[^"])*)",'
        r'marketCap:(?P<marketCap>-?\d+(?:\.\d+)?),'
        r'price:(?P<price>-?\d+(?:\.\d+)?|null),'
        r'change:(?P<change>-?\d+(?:\.\d+)?|null),'
        r'industry:"(?P<industry>(?:\\.|[^"])*)"',
        re.S,
    )
    items: list[dict] = []
    for match in pattern.finditer(page):
        market_cap_b = float(match.group("marketCap")) / 1_000_000_000
        if market_cap_b < threshold_b:
            continue
        price_text = match.group("price")
        ticker = match.group("ticker").upper()
        items.append(
            {
                "ticker": ticker,
                "name": parse_js_string(match.group("name")),
                "date": None,
                "exchange": "",
                "sector": parse_js_string(match.group("industry")),
                "ipoPrice": None,
                "current": float(price_text) if price_text != "null" else None,
                "marketCap": market_cap_b,
                "dealSize": None,
                "dayChange": None,
                "detailUrl": stockanalysis_url(ticker),
                "listUrl": SCREENER_URL,
            }
        )
    items.sort(key=lambda item: item["marketCap"], reverse=True)
    return items[:candidate_limit] if candidate_limit else items


def ticker_candidate(ticker: str) -> dict:
    ticker = normalize_ticker(ticker)
    return {
        "ticker": ticker,
        "name": ticker,
        "date": None,
        "exchange": "",
        "sector": "",
        "ipoPrice": None,
        "current": None,
        "marketCap": None,
        "dealSize": None,
        "dayChange": None,
        "detailUrl": stockanalysis_url(ticker),
        "listUrl": stockanalysis_url(ticker),
    }


def merge_candidates(candidates: list[dict]) -> list[dict]:
    merged: dict[str, dict] = {}
    for candidate in candidates:
        ticker = normalize_ticker(candidate["ticker"])
        candidate = {**candidate, "ticker": ticker}
        if ticker not in merged:
            merged[ticker] = candidate
            continue
        current = merged[ticker]
        for key, value in candidate.items():
            if value is None or value == "":
                continue
            if key in {"date", "ipoPrice", "dayChange"}:
                current[key] = value
            elif key == "name" and current.get("name") == ticker:
                current[key] = value
            elif not current.get(key):
                current[key] = value
    return list(merged.values())


def fetch_profile(ipo: dict) -> dict:
    ticker = ipo["ticker"]
    overview = fetch_text(ipo["detailUrl"])
    company_url = stockanalysis_url(ticker, "company/")
    try:
        company = fetch_text(company_url)
    except urllib.error.URLError:
        company = ""

    current = parse_current_price(overview) or ipo.get("current")
    market_cap = parse_market_cap_b(parse_row_value(overview, "Market Cap")) or ipo.get("marketCap")
    exchange = parse_row_value(company, "Exchange") or parse_row_value(overview, "Stock Exchange") or ipo.get("exchange")
    industry = parse_row_value(company, "Industry") or ipo.get("sector")
    sector = parse_row_value(company, "Sector")
    ipo_price = parse_money(parse_row_value(company, "IPO Price")) or ipo.get("ipoPrice")
    ipo_date_text = parse_row_value(company, "IPO Date")
    ipo_date = parse_us_date(ipo_date_text) if ipo_date_text and "," in ipo_date_text else ipo.get("date")
    deal_size = fetch_deal_size_m(ticker, ipo_price)

    day_change = None
    if current is not None and ipo_price:
        day_change = (current - ipo_price) / ipo_price * 100

    return {
        **ipo,
        "date": ipo_date,
        "exchange": exchange or "",
        "sector": industry or sector or "",
        "ipoPrice": ipo_price,
        "current": current,
        "marketCap": market_cap,
        "dealSize": deal_size,
        "dayChange": day_change if day_change is not None else ipo.get("dayChange"),
        "companyUrl": company_url,
    }


def fetch_deal_size_m(ticker: str, ipo_price: float | None) -> float | None:
    release_url = PRICING_RELEASES.get(ticker)
    if not release_url:
        return None
    try:
        page = fetch_text(release_url)
    except urllib.error.URLError:
        return None
    shares_match = re.search(r"aggregate of ([\d,]+) shares", page, re.I)
    price_match = re.search(r"public offering price of \$([\d,.]+)", page, re.I)
    if not shares_match:
        return None
    shares = float(shares_match.group(1).replace(",", ""))
    price = float(price_match.group(1).replace(",", "")) if price_match else ipo_price
    return shares * price / 1_000_000 if price else None


def date_to_epoch_utc(date_s: str) -> int:
    d = dt.date.fromisoformat(date_s)
    return int(dt.datetime(d.year, d.month, d.day, tzinfo=UTC).timestamp())


def yahoo_url(ticker: str, date_s: str, interval: str, *, days: int = 1) -> str:
    p1 = date_to_epoch_utc(date_s)
    p2 = p1 + 86_400 * days
    params = urllib.parse.urlencode(
        {
            "period1": p1,
            "period2": p2,
            "interval": interval,
            "includePrePost": "false",
            "events": "history",
        }
    )
    return f"{YAHOO_CHART_BASE}/{urllib.parse.quote(yahoo_symbol(ticker))}?{params}"


def num_at(values: list | None, index: int) -> float | None:
    if not values or index >= len(values):
        return None
    value = values[index]
    if value is None:
        return None
    out = float(value)
    return out if math.isfinite(out) else None


def fetch_first_day_bars(ipo: dict, interval: str) -> list[list]:
    data = fetch_json(yahoo_url(ipo["ticker"], ipo["date"], interval))
    result = ((data.get("chart") or {}).get("result") or [None])[0]
    if not result:
        error = (data.get("chart") or {}).get("error") or {}
        raise RuntimeError(error.get("description") or error.get("code") or "No chart result")

    timestamps = result.get("timestamp") or []
    quote = (((result.get("indicators") or {}).get("quote") or [{}])[0])
    target_date = dt.date.fromisoformat(ipo["date"])
    rows: list[list] = []
    for index, timestamp in enumerate(timestamps):
        local = dt.datetime.fromtimestamp(int(timestamp), tz=UTC).astimezone(ET)
        if local.date() != target_date:
            continue
        open_ = num_at(quote.get("open"), index)
        high = num_at(quote.get("high"), index)
        low = num_at(quote.get("low"), index)
        close = num_at(quote.get("close"), index)
        volume = num_at(quote.get("volume"), index) or 0
        values = [open_, high, low, close]
        if any(value is None for value in values):
            continue
        if is_zero_volume_offer_placeholder(values, volume, ipo.get("ipoPrice")):
            continue
        rows.append([local.strftime("%H:%M"), rounded(open_, 4), rounded(high, 4), rounded(low, 4), rounded(close, 4), int(volume)])
    return rows


def fetch_first_day_daily(ipo: dict) -> dict | None:
    data = fetch_json(yahoo_url(ipo["ticker"], ipo["date"], "1d", days=7))
    result = ((data.get("chart") or {}).get("result") or [None])[0]
    if not result:
        error = (data.get("chart") or {}).get("error") or {}
        raise RuntimeError(error.get("description") or error.get("code") or "No daily chart result")

    timestamps = result.get("timestamp") or []
    quote = (((result.get("indicators") or {}).get("quote") or [{}])[0])
    target_date = dt.date.fromisoformat(ipo["date"])
    for index, timestamp in enumerate(timestamps):
        local = dt.datetime.fromtimestamp(int(timestamp), tz=UTC).astimezone(ET)
        if local.date() < target_date:
            continue
        open_ = num_at(quote.get("open"), index)
        high = num_at(quote.get("high"), index)
        low = num_at(quote.get("low"), index)
        close = num_at(quote.get("close"), index)
        volume = num_at(quote.get("volume"), index) or 0
        if any(value is None for value in [open_, high, low, close]):
            continue
        return {
            "date": local.date().isoformat(),
            "open": rounded(open_, 4),
            "high": rounded(high, 4),
            "low": rounded(low, 4),
            "close": rounded(close, 4),
            "volume": int(volume),
            "source": "Yahoo 1d",
        }
    return None


def is_zero_volume_offer_placeholder(values: list[float | None], volume: float, ipo_price: float | None) -> bool:
    if volume != 0 or ipo_price is None:
        return False
    return all(value is not None and abs(value - ipo_price) < 0.01 for value in values)


def rounded(value: float | None, places: int = 2) -> float | None:
    if value is None:
        return None
    return round(value, places)


def known_start_price(ipo: dict, bars: list[list] | None = None) -> float | None:
    if bars:
        return bars[0][1]
    first_day = ipo.get("firstDay")
    if first_day and first_day.get("open") is not None:
        return float(first_day["open"])
    if ipo.get("ipoPrice") is not None:
        return float(ipo["ipoPrice"])
    return None


def start_price_too_low(ipo: dict, min_start_price: float | None, bars: list[list] | None = None) -> bool:
    if min_start_price is None:
        return False
    start = known_start_price(ipo, bars)
    return start is not None and start < min_start_price


def card_record(ipo: dict) -> dict:
    first_day = ipo.get("firstDay")
    return {
        "ticker": ipo["ticker"],
        "name": ipo["name"],
        "date": ipo["date"],
        "exchange": ipo.get("exchange") or "",
        "sector": ipo.get("sector") or "",
        "ipoPrice": rounded(ipo.get("ipoPrice")),
        "current": rounded(ipo.get("current")),
        "marketCap": rounded(ipo.get("marketCap")),
        "dealSize": rounded(ipo.get("dealSize")),
        "dayChange": rounded(ipo.get("dayChange")),
        "firstDay": first_day,
    }


def write_js(path: pathlib.Path, variable: str, data, sources: list[str]) -> None:
    today = dt.date.today().isoformat()
    header = [
        f"// Generated by refresh_ipo_data.py on {today}.",
        *[f"// Source: {source}" for source in sources],
        f"window.{variable} = ",
    ]
    path.write_text("\n".join(header) + json.dumps(data, indent=2) + ";\n", encoding="utf-8")


def build(args: argparse.Namespace) -> int:
    output_dir = pathlib.Path(args.output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    source = "yearly" if args.year is not None else args.source
    if source == "screener":
        candidates = parse_stock_screener(args.threshold_b, args.candidate_limit)
        source_urls = [SCREENER_URL]
        print(f"Fetched {len(candidates)} StockAnalysis screener candidates with market cap >= ${args.threshold_b:g}B.")
        if args.recent_after_year is not None:
            recent_start_year = args.recent_after_year + 1
            recent = parse_ipo_lists(args.start_year, recent_start_year)
            candidates.extend(recent)
            step = -1 if args.start_year >= recent_start_year else 1
            source_urls.extend(f"{BASE_URL}/ipos/{year}/" for year in range(args.start_year, recent_start_year + step, step))
            print(f"Added {len(recent)} IPO archive candidates after {args.recent_after_year}.")
        include_tickers = [normalize_ticker(ticker) for ticker in args.include_ticker]
        candidates.extend(ticker_candidate(ticker) for ticker in include_tickers)
        exclude_tickers = {normalize_ticker(ticker) for ticker in args.exclude_ticker}
        ipos = [
            candidate for candidate in merge_candidates(candidates)
            if normalize_ticker(candidate["ticker"]) not in exclude_tickers
        ]
        if exclude_tickers:
            print(f"Excluded candidate tickers by rule: {', '.join(sorted(exclude_tickers))}")
        print(f"Enriching {len(ipos)} unique candidates.")
    elif args.year is not None:
        ipos = parse_ipo_list(args.year)
        source_urls = [f"{BASE_URL}/ipos/{args.year}/"]
        print(f"Fetched {len(ipos)} IPO rows from StockAnalysis {args.year}.")
    else:
        ipos = parse_ipo_lists(args.start_year, args.end_year)
        step = -1 if args.start_year >= args.end_year else 1
        source_urls = [f"{BASE_URL}/ipos/{year}/" for year in range(args.start_year, args.end_year + step, step)]
        print(f"Fetched {len(ipos)} unique IPO symbols across {args.start_year}-{args.end_year}.")

    profiles: list[dict] = []
    with ThreadPoolExecutor(max_workers=args.max_workers) as pool:
        futures = [pool.submit(fetch_profile, ipo) for ipo in ipos]
        for future in as_completed(futures):
            try:
                profiles.append(future.result())
            except Exception as exc:
                print(f"warning: profile fetch failed: {exc}", file=sys.stderr)

    qualifying = [
        ipo for ipo in profiles
        if ipo.get("date") and ipo.get("marketCap") is not None and ipo["marketCap"] >= args.threshold_b
    ]
    qualifying.sort(key=lambda item: (item.get("marketCap") or 0, item.get("date") or ""), reverse=True)
    print(f"Found {len(qualifying)} IPOs with market cap >= ${args.threshold_b:g}B.")

    for item in qualifying:
        try:
            item["firstDay"] = fetch_first_day_daily(item)
            time.sleep(args.request_delay)
        except Exception as exc:
            print(f"warning: {item['ticker']} Yahoo daily failed: {exc}", file=sys.stderr)

    start_excluded = [
        ipo for ipo in qualifying
        if start_price_too_low(ipo, args.min_start_price)
    ]
    if start_excluded:
        excluded = ", ".join(
            f"{ipo['ticker']} ({known_start_price(ipo):.4g})"
            for ipo in start_excluded
        )
        print(f"Excluded {len(start_excluded)} IPOs with known start price below ${args.min_start_price:g}: {excluded}")
    eligible = [
        ipo for ipo in qualifying
        if not start_price_too_low(ipo, args.min_start_price)
    ]

    top_selected = eligible[:args.limit]
    recent_selected = []
    if source == "screener" and args.recent_after_year is not None:
        recent_selected = [
            ipo for ipo in eligible
            if int(ipo["date"][:4]) > args.recent_after_year
        ]
        recent_selected.sort(key=lambda item: (item.get("date") or "", item.get("marketCap") or 0), reverse=True)
    forced_selected = [
        ipo for ipo in eligible
        if normalize_ticker(ipo["ticker"]) in {normalize_ticker(ticker) for ticker in args.include_ticker}
    ]
    selected_by_ticker: dict[str, dict] = {}
    for item in [*top_selected, *recent_selected, *forced_selected]:
        selected_by_ticker.setdefault(item["ticker"], item)
    selected = sorted(selected_by_ticker.values(), key=lambda item: (item.get("marketCap") or 0, item.get("date") or ""), reverse=True)
    print(f"Selected {len(top_selected)} top-cap IPOs plus {len(recent_selected)} recent IPOs after {args.recent_after_year}.")
    print(f"Writing {len(selected)} unique IPO cards.")
    for item in selected:
        current = f"${item['current']:.2f}" if item.get("current") is not None else "current n/a"
        print(f"- {item['ticker']}: ${item['marketCap']:.2f}B market cap, {current}")

    first_day_bars = {}
    final_selected = []
    for item in selected:
        if item.get("firstDay"):
            daily = item["firstDay"]
            print(f"  {item['ticker']}: Yahoo 1d O {daily['open']} H {daily['high']} L {daily['low']} C {daily['close']}")
        try:
            bars = fetch_first_day_bars(item, args.interval)
            if start_price_too_low(item, args.min_start_price, bars):
                print(f"warning: {item['ticker']} removed after Yahoo {args.interval} start ${known_start_price(item, bars):.4g} below ${args.min_start_price:g}", file=sys.stderr)
                continue
            first_day_bars[item["ticker"]] = bars
            print(f"  {item['ticker']}: {len(bars)} Yahoo {args.interval} bars")
            time.sleep(args.request_delay)
        except Exception as exc:
            print(f"warning: {item['ticker']} Yahoo bars failed: {exc}", file=sys.stderr)
        final_selected.append(item)
    selected = final_selected

    ipo_sources = [
        *source_urls,
        *[item["detailUrl"] for item in selected],
        *[item["companyUrl"] for item in selected],
        *[PRICING_RELEASES[item["ticker"]] for item in selected if item["ticker"] in PRICING_RELEASES],
    ]
    chart_sources = [
        source
        for item in selected
        for source in [yahoo_url(item["ticker"], item["date"], "1d", days=7), yahoo_url(item["ticker"], item["date"], args.interval)]
    ]
    write_js(output_dir / "ipo-data.js", "ipos", [card_record(item) for item in selected], ipo_sources)
    write_js(output_dir / "chart-data.js", "firstDayBars", first_day_bars, chart_sources)
    from build_ipo_analysis import build_analysis_file

    analysis_path = build_analysis_file(output_dir, output_dir, as_of=dt.date.today().isoformat())
    print(f"Wrote {output_dir / 'ipo-data.js'}")
    print(f"Wrote {output_dir / 'chart-data.js'}")
    print(f"Wrote {analysis_path}")
    return 0


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Refresh IPO metadata and first-day chart bars.")
    parser.add_argument("--source", choices=["screener", "yearly"], default="screener", help="candidate source to scan")
    parser.add_argument("--year", type=int, default=None, help="single IPO year to scan; omit to scan a range")
    parser.add_argument("--start-year", type=int, default=DEFAULT_START_YEAR)
    parser.add_argument("--end-year", type=int, default=DEFAULT_END_YEAR)
    parser.add_argument("--limit", type=int, default=DEFAULT_LIMIT, help="maximum number of IPO cards to write")
    parser.add_argument("--candidate-limit", type=int, default=DEFAULT_CANDIDATE_LIMIT, help="maximum screener candidates to enrich")
    parser.add_argument("--recent-after-year", type=int, default=DEFAULT_RECENT_AFTER_YEAR, help="also include IPOs after this year when using the screener source")
    parser.add_argument("--include-ticker", action="append", default=DEFAULT_INCLUDE_TICKERS.copy(), help="ticker to force into the candidate set; can be repeated")
    parser.add_argument("--exclude-ticker", action="append", default=DEFAULT_EXCLUDE_TICKERS.copy(), help="ticker to exclude from the candidate set; can be repeated")
    parser.add_argument("--min-start-price", type=float, default=DEFAULT_MIN_START_PRICE, help="drop IPOs whose known first-day start/open price is below this amount; use a negative value to disable")
    parser.add_argument("--threshold-b", type=float, default=DEFAULT_THRESHOLD_B, help="minimum market cap in billions USD")
    parser.add_argument("--interval", default=DEFAULT_INTERVAL, help="Yahoo Finance intraday interval")
    parser.add_argument("--max-workers", type=int, default=8)
    parser.add_argument("--request-delay", type=float, default=0.15)
    parser.add_argument("--output-dir", default=".")
    args = parser.parse_args(argv)
    if args.min_start_price < 0:
        args.min_start_price = None
    return args


if __name__ == "__main__":
    raise SystemExit(build(parse_args(sys.argv[1:])))
