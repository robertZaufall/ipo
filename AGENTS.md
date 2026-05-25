# AGENTS.md - IPO Site

This repo builds the static `ipo` page published at:

- Public URL: `https://glaubi.net/ipo`
- GitHub Pages upstream: `https://robertzaufall.github.io/ipo`
- GitHub repo: `https://github.com/robertZaufall/ipo`
- Local site repo: `/Users/master/clawd/projects/ipo-site`
- Cloudflare Worker proxy source: `/Users/master/clawd/projects/ipo-proxy`

## Current Shape

- The app is a static page: `index.html` plus generated `ipo-data.js`, `chart-data.js`, and `ipo-analysis.js`.
- There is no build step.
- Styling uses Tailwind from CDN plus local CSS in `index.html`.
- Candlestick charts are inline SVG generated in browser JavaScript.
- The top analysis panel is an inline SVG/HTML view generated in browser JavaScript from precomputed `ipo-analysis.js`.
- The visible analysis UI contains two distribution charts followed by balanced side-by-side `Decision odds` and `Timing tells` panels. Do not re-add the removed checkpoint pill or trailing "not a buy signal" note unless Rob asks.
- Do not reintroduce charting CDNs unless Rob explicitly asks. Earlier chart-library attempts rendered blank in production.
- The chart path only draws real first-trading-day 5-minute OHLCV bars from `chart-data.js`. Suppress cards without exact bars; do not reintroduce daily-OHLC estimates or synthetic fallback charts unless Rob explicitly asks.
- Use `refresh_ipo_data.py` to refresh the IPO list, first-day intraday bars, and derived timing analysis.
- Use `build_ipo_analysis.py` only when rebuilding the analysis from existing generated data without re-fetching market data.

## Data Model

The page has three generated JavaScript data files:

- `ipos` in `ipo-data.js`: one object per IPO candidate/card; the page renders only entries with exact `firstDayBars`.
- `firstDayBars` in `chart-data.js`: optional real first-trading-day 5-minute OHLCV bars keyed by ticker.
- `firstDayBarSources` in `chart-data.js`: per-ticker provider labels such as `Yahoo 5m bars`, `Alpaca SIP 5m bars`, or `Alpha Vantage 5m bars`.
- `ipoAnalysis` in `ipo-analysis.js`: derived 15-year first-day low timing analysis, probability checkpoints, and timing insights.

IPO object fields:

- `ticker`
- `name`
- `date` - first trading date, `YYYY-MM-DD`
- `exchange`
- `sector`
- `ipoPrice` - offer price in USD
- `current` - latest/current StockAnalysis price when refreshed
- `marketCap` - billions USD
- `dealSize` - millions USD raised
- `dayChange` - percent from IPO price to current price
- `firstDay` - optional Yahoo daily OHLC reference, not used for chart rendering

`firstDayBars` row format:

```js
["12:55", open, high, low, close, volume]
```

`ipoAnalysis` includes:

- `cutoffDate` - rolling 15-year analysis start date.
- `sampleSize` - number of IPOs with exact first-day 5-minute bars in the analysis window.
- `sourceCounts` - exact 5-minute count plus missing exact-bar count.
- `medianDeltaMinutes`, `firstHourPct`, `afterTwoHoursPct`.
- `buckets` - elapsed-time buckets from first trade to first-day low.
- `medianLowTime`, `medianLowGermanLabel`, `noonOrLaterPct`, `clockBuckets` - US/Eastern and German local clock-time analysis for when the first-day low occurred.
- Clock-time labels use 24-hour format for NYC plus German ` (DE)` labels, for example `09:30`, `13:00`, and `13:00-14:00 (DE)`.
- `decisionCheckpoints` and `decisionInsights` - visible probability readouts for wait timing, opening-rush risk, lunch-or-later lows, and final-hour dips.
- `fastestLow`, `latestLow`, and per-symbol `records`.
- `expertNotes` - researched source URLs retained in generated data for provenance; not currently rendered in the page UI.

## Data Gathering Method

The last refresh was done on 2026-05-26.

Primary candidate source:

- `https://stockanalysis.com/stocks/screener/`
- Use the top 25 symbols whose current market cap is above `$25B` and whose StockAnalysis company profile has an IPO date.
- Also include every IPO after 2020 with current market cap above `$25B`, using StockAnalysis yearly IPO archive pages.
- Exclude IPOs whose known first-day start/open price is below `$1`; the default script threshold is `--min-start-price 1`.
- Exclude `VG` / Venture Global by default because Yahoo currently returns missing or wrong first-day prices.
- `CBRS` is force-added to the candidate set by default and must remain included when it qualifies; Rob may typo it as `CRBS`, but the correct ticker is `CBRS`.
- `refresh_ipo_data.py` can still scan only yearly IPO archive pages with `--source yearly` or `--year`, but the default source is the combined screener + post-2020 archive set.

Per-ticker detail source:

- `https://stockanalysis.com/stocks/<ticker>/`
- `https://stockanalysis.com/stocks/<ticker>/company/`
- Pull or verify current price, market cap, IPO price/date, exchange, sector/industry, and related company fields from the StockAnalysis ticker pages when available.
- For `CBRS`, also checked Cerebras' own IPO pricing release:
  `https://www.cerebras.ai/press-release/cerebras-systems-announces-pricing-of-initial-public-offering`

Intraday candle source:

- Yahoo Finance chart endpoint, example:
  `https://query1.finance.yahoo.com/v8/finance/chart/CBRS?period1=<epoch>&period2=<epoch>&interval=5m&includePrePost=false&events=history`
- Alpaca market data historical stock bars are used as the primary fallback when paper/data credentials are available from `APCA_API_KEY_ID` plus `APCA_API_SECRET_KEY`, or compatible `ALPACA_*` names.
- Alpaca bars endpoint example:
  `https://data.alpaca.markets/v2/stocks/bars?symbols=ARM&timeframe=5Min&start=<rfc3339>&end=<rfc3339>&adjustment=raw&feed=sip`
- Never commit Alpaca or Alpha Vantage keys. Alpaca keys are sent only as request headers; generated source comments must not include credentials. Alpha Vantage generated source comments must keep the `apikey` redacted.
- Alpha Vantage `TIME_SERIES_INTRADAY` remains an optional fallback when a key is available from `ALPHAVANTAGE_KEY`, `ALPHAVANTAGE_API_KEY`, `ALPHA_VANTAGE_API_KEY`, or `AV_API_KEY`.
- Historical Alpha Vantage intraday month data requires a premium-enabled key; if the current key returns a premium-endpoint message, the script disables the fallback for the rest of that refresh.

Daily first-day price reference:

- Yahoo Finance chart endpoint with `interval=1d`.
- Stored in `ipo-data.js` as `firstDay` for metadata/reference only; it must not be used to draw candle charts.

Analysis source:

- `build_ipo_analysis.py` reads `ipo-data.js` and `chart-data.js`.
- It analyzes only exact 5-minute bars from `chart-data.js`.
- It analyzes IPOs in the rolling 15-year window as of the data refresh date.
- Missing exact bars are counted in `sourceCounts.missingExact5m`; daily-OHLC estimates and synthetic fallback charts are not included.
- Clock-time buckets are based on US/Eastern market time and should show dual NYC plus German ` (DE)` labels in 24-hour format. Generate German labels in Python with `Europe/Berlin` timezone conversion rather than a hard-coded offset because US/EU daylight-saving changes do not always align.
- Current expert-note research sources:
  - SEC Investor.gov IPO bulletin: `https://www.sec.gov/files/ipo-investorbulletin.pdf`
  - Schwab IPO basics: `https://www.schwab.com/learn/story/ipo-basics-what-to-know-before-investing`
  - Fidelity IPO FAQ: `https://www.fidelity.com/stock-trading/faqs-ipos`

Process for real first-day bars:

1. Fetch Yahoo `chart.result[0]`.
2. Convert timestamps to US/Eastern market times.
3. Keep only rows whose local date equals the IPO first trading date.
4. Read `quote.open/high/low/close/volume`.
5. Drop rows with missing OHLC values.
6. Drop zero-volume offer-price placeholder rows. For `CBRS`, Yahoo included `$185` zero-volume rows before real trading; those are wrong for the visible first-day chart.
7. Store rows as compact arrays in `chart-data.js` as `firstDayBars`.
8. Store card metadata in `ipo-data.js` as `ipos`.

Important sanity check:

- `CBRS` should start with the real Nasdaq opening print around:
  `12:55 O 350 H 385 L 350 C 385`
- The chart should then fade into the low 300s, not show a smooth ramp from the `$185` IPO offer price.

## Local Editing

Open the site directly or serve it with any static server:

```sh
cd /Users/master/clawd/projects/ipo-site
python3 -m http.server 8080
```

Then open:

```text
http://localhost:8080
```

Most layout and behavior edits are made directly in `index.html`; generated IPO metadata lives in `ipo-data.js`, real candle rows live in `chart-data.js`, and derived low-timing analysis lives in `ipo-analysis.js`.

Refresh the default combined `$25B+` data set with:

```sh
cd /Users/master/clawd/projects/ipo-site
python3 refresh_ipo_data.py --threshold-b 25 --limit 25
```

Rebuild only the derived analysis from existing generated data with:

```sh
cd /Users/master/clawd/projects/ipo-site
python3 build_ipo_analysis.py --input-dir . --output-dir .
```

## Deploy Site

The site repo is Git-backed and pushes to GitHub Pages:

```sh
cd /Users/master/clawd/projects/ipo-site
git status --short
git add index.html ipo-data.js chart-data.js ipo-analysis.js refresh_ipo_data.py build_ipo_analysis.py AGENTS.md README.md LICENSE
git commit -m "Update IPO site"
git push
```

After pushing, verify:

```sh
curl -I https://robertzaufall.github.io/ipo/
curl -I https://glaubi.net/ipo
```

Use a cache-busting query when visually checking:

```text
https://glaubi.net/ipo?v=<commit>
```

## Cloudflare Worker Proxy

Do not delete `/Users/master/clawd/projects/ipo-proxy` unless the proxy is moved into a real repo or the Cloudflare route is intentionally removed.

The live `glaubi.net/ipo` route depends on the Worker source in that folder:

- Worker name: `ipo-proxy`
- Config: `/Users/master/clawd/projects/ipo-proxy/wrangler.toml`
- Worker code: `/Users/master/clawd/projects/ipo-proxy/index.mjs`
- Routes:
  - `glaubi.net/ipo`
  - `glaubi.net/ipo*`
  - `glaubi.net/ipo/*`

The Worker maps hidden-path requests:

```text
https://glaubi.net/ipo     -> https://robertzaufall.github.io/ipo/
https://glaubi.net/ipo/... -> https://robertzaufall.github.io/ipo/...
```

It also injects:

```html
<base href="/ipo/">
```

into HTML responses when needed.

Deploy proxy changes with:

```sh
cd /Users/master/clawd/projects/ipo-proxy
HOME=/Users/master npx wrangler deploy
```

Check deployed Worker history:

```sh
cd /Users/master/clawd/projects/ipo-proxy
HOME=/Users/master npx wrangler deployments list --name ipo-proxy
```

## Glaubinet Index

The route index card for this page lives in:

```text
/Users/master/git/glaubinet/index.html
```

Use the `glaubinet` skill/workflow when changing public `glaubi.net` mappings. For this page the index currently points `/ipo` to:

```text
Major IPOs - First-Day Charts
```

## Verification Checklist

Before calling an IPO change done:

- `index.html` still renders without a build step.
- `ipo-data.js` includes the top 25 cap leaders plus all post-2020 `$25B+` IPOs.
- `ipo-analysis.js` is generated from `build_ipo_analysis.py` and the top analysis panel renders above the filters.
- The top analysis panel shows both elapsed-time delta and US/Eastern clock-time distributions for exact first-day 5-minute lows.
- The analysis panel shows `Decision odds` and `Timing tells` as even side-by-side panels below the bar charts, without a checkpoint highlight pill or generic disclaimer row.
- Clock-time chart labels use 24-hour NYC and German ` (DE)` format, not AM/PM labels.
- No included IPO has a known `firstDay.open` below `$1`.
- `CBRS` is present and its chart uses real Yahoo 5-minute bars and does not begin at `$185`.
- Missing exact 5-minute bars are suppressed from the card list, not rendered as estimated charts.
- Search filters cards by ticker/company/exchange/sector.
- Sort button toggles between IPO date recent-first and market cap biggest-first.
- Inline JavaScript syntax still passes, for example:
  `perl -0ne 'while(/<script>(.*?)<\/script>/sg){print $1}' index.html > /tmp/ipo-inline.js && node --check /tmp/ipo-inline.js`
- Python scripts compile:
  `python3 -m py_compile refresh_ipo_data.py build_ipo_analysis.py`
- `https://glaubi.net/ipo` returns the page, not a 404.
- `https://glaubi.net/ipo?v=<commit>` visually shows candles.
