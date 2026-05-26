# IPO Site

Static first-day IPO chart page for `https://glaubi.net/ipo`.

The site shows large IPO companies as full-width cards only when exact 5-minute IPO-day bars are available, plus a top timing analysis built from those exact bars. The header market-cap filter defaults to `>$10B`, the trading-place filter defaults to `All`, and both switch the card list plus the precomputed probability analysis. Each card includes five micro charts comparing IPO price, first-day start, first-day low, first-day close, and today's price.

## Files

- `index.html` - static page, styles, chart renderer, search, and sort toggle.
- `ipo-data.js` - generated IPO card metadata.
- `chart-data.js` - generated exact 5-minute first-day bars where available.
- `ipo-analysis.js` - generated 15-year low-timing analysis, decision odds, and timing insights, precomputed per cap and trading-place filter.
- `refresh_ipo_data.py` - refreshes IPO metadata, chart data, and analysis.
- `build_ipo_analysis.py` - rebuilds only `ipo-analysis.js` from existing generated data.

## Run Locally

```sh
python3 -m http.server 8080
```

Open `http://localhost:8080`.

## Refresh Data

```sh
python3 refresh_ipo_data.py --threshold-b 5 --limit 500 --candidate-limit 1000
```

The refresh uses StockAnalysis for IPO metadata, Yahoo Finance chart endpoints for first-day OHLCV data, and Alpaca market data as the main exact intraday fallback when paper/data credentials are available through `APCA_API_KEY_ID` plus `APCA_API_SECRET_KEY` or compatible `ALPACA_*` env vars. Candle charts use only exact 5-minute rows in `chart-data.js`; missing exact bars are suppressed rather than estimated.

API keys are read only from the environment and must not be committed. Alpaca credentials are sent only in request headers. Alpha Vantage remains an optional fallback, but historical intraday month requests require a premium-enabled Alpha Vantage key.

Clock-time analysis is shown with dual 24-hour labels: NYC time plus German local time with a ` (DE)` suffix, converted in Python with daylight-saving rules. The visible analysis UI has two distribution charts, then balanced side-by-side `Decision odds` and `Timing tells` panels. Its numbers come from `ipo-analysis.js` rather than being recalculated in the browser.

To rebuild only the derived analysis:

```sh
python3 build_ipo_analysis.py --input-dir . --output-dir .
```

## Verify

```sh
python3 -m py_compile refresh_ipo_data.py build_ipo_analysis.py
perl -0ne 'while(/<script>(.*?)<\/script>/sg){print $1}' index.html > /tmp/ipo-inline.js && node --check /tmp/ipo-inline.js
```

For visual QA, serve the page locally and check that the header cap and trading-place filters change the `Sample`, `Decision odds`, and card count together. Also check the `Decision odds` / `Timing tells` panels, search, sort toggle, the `CBRS` Yahoo chart, and at least one Alpaca-sourced chart such as `ARM`.

## Deploy

This repo is published through GitHub Pages at `https://robertzaufall.github.io/ipo/` and proxied to `https://glaubi.net/ipo`.

```sh
git add index.html ipo-data.js chart-data.js ipo-analysis.js refresh_ipo_data.py build_ipo_analysis.py README.md LICENSE AGENTS.md
git commit -m "Update IPO site"
git push
```

## License

MIT. See `LICENSE`.
