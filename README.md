# IPO Site

Static first-day IPO chart page for `https://glaubi.net/ipo`.

The site shows large IPO companies as full-width cards only when exact 5-minute IPO-day bars are available, plus a top buying-decision dashboard built from those exact bars. The header market-cap filter defaults to `>$25B`, the trading-place filter defaults to `All`, and both switch the card list plus the probability analysis. A top `Day 1` / `Ext` switch changes all visible charts between first-day-only candles and available Alpaca extended-hours candles, while card-level switches can override individual charts. Each card links the company name to its Yahoo Finance quote page, shows cap plus deal-size pills in the header when available, and uses an ordered price-level timeline for IPO/start/low/median/end, extended after/pre/open prices, and current* snapshot price. Cards intentionally do not show the ambiguous generated IPO-to-current return field.

Each card also includes five micro charts comparing IPO price, first-day start, first-day low, first-day close, and current* snapshot price. Micro-chart lines use exact IPO-day 5-minute closes where possible and sampled Yahoo weekly closes for rough longer-term paths. Entry-scenario panels compare buying at the open, active median timing, 30 minutes, 60 minutes, 2 hours, after-hours end, second-day premarket, and second-day open, with separate day-end, gap-to-median, and gap-to-low results.

## Screenshots

![IPO decision dashboard screenshot](docs/ipo-dashboard.png)

![Latest IPO card screenshot](docs/latest-ipo-card.png)

![Extended-hours candle chart screenshot](docs/extended-chart.png)

## Files

- `index.html` - static page, styles, decision dashboard, chart renderer, filters, search, and sort toggle.
- `ipo-data.js` - generated IPO card metadata.
- `chart-data.js` - generated exact 5-minute first-day bars, optional Alpaca extended-hours bars, and sampled rough weekly close paths where available.
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

The refresh uses StockAnalysis for IPO metadata, Yahoo Finance chart endpoints for latest quote prices, rough weekly mini-chart history, and first-day OHLCV data, and Alpaca market data as the main exact intraday fallback when paper/data credentials are available through `APCA_API_KEY_ID` plus `APCA_API_SECRET_KEY` or compatible `ALPACA_*` env vars. Alpaca also provides optional extended-hours chart data from the first-day close through the next regular-session opening candle. Candle charts use only exact 5-minute rows in `chart-data.js`; missing exact bars are suppressed rather than estimated.

API keys are read only from the environment and must not be committed. Alpaca credentials are sent only in request headers. Alpha Vantage remains an optional fallback, but historical intraday month requests require a premium-enabled Alpha Vantage key.

Clock-time analysis is shown with dual 24-hour labels in `HH:MM (DE HH:MM)` format, or as two lines where space is tight, converted with daylight-saving rules. The visible analysis UI has a buyer-window summary, metric cards, a full-width elapsed-time opportunity map, two larger distribution charts with dynamic median reference lines, a full-width `Decision odds` section, an entry-scenario comparison for all eight entry scenarios, and summary pills for median clock, common clock, late lows, current filter, and scenario highlights. A compact two-thumbnail infographic strip above search opens the playbook and buy-timing guides. The low-timing dashboard comes from `ipo-analysis.js`; entry-scenario comparisons are calculated in the browser from the active filtered exact bars.

Main candle charts show only real 5-minute bars. First-day charts include a top elapsed-minutes axis from the first public trade, bottom NYC/German clock labels, the active-filter median timing reference line, the first public open reference line, the first-day low reference, and conditional IPO-price/current-price horizontal reference lines only when those prices fall inside the visible OHLC range. Extended charts add shaded extended-hours backgrounds, a single solid white overnight break, first-day after-hours elapsed labels, and second-day premarket countdown labels. Each card chart has an enlarge button that opens the current chart in a full-screen modal. Missing intraday spans are expected and are compressed instead of drawn as empty time. Low markers are selected from the same near-low price band and are spaced at least one hour apart so late retests are visible without labeling every adjacent candle. Visible candle source labels are compact provider markers such as `(Y)` for Yahoo and `(A)` for Alpaca.

To rebuild only the derived analysis:

```sh
python3 build_ipo_analysis.py --input-dir . --output-dir .
```

## Verify

```sh
python3 -m py_compile refresh_ipo_data.py build_ipo_analysis.py
perl -0ne 'while(/<script>(.*?)<\/script>/sg){print $1}' index.html > /tmp/ipo-inline.js && node --check /tmp/ipo-inline.js
```

For visual QA, serve the page locally and check that the header cap and trading-place filters change the `Sample`, `Decision odds`, median markers, entry-scenario analysis, scenario insight pills, and card count together. Also check the compact timing/playbook infographic thumbnails and modals, search, sort toggle, chart enlarge modal, the `CBRS` Yahoo chart, rough-path micro charts, card entry-scenario controls, the Yahoo Finance company-name links, and at least one Alpaca-sourced chart such as `ARM`. In main candle charts, verify the top elapsed-minutes axis, compact provider marker, blue median timing line, gray open reference line, and confirm IPO/current price reference lines appear only when in range. Toggle the global `Ext` control and one card-level switch to verify extended candles, shaded extended-hours regions, and the white overnight break.

## Deploy

This repo is pushed to GitHub at `https://github.com/robertZaufall/ipo`. The public route `https://glaubi.net/ipo` is served by the Cloudflare Worker in `<local-ipo-proxy-repo>`, which fetches the static files from GitHub raw `main` and injects `<base href="/ipo/">`.

```sh
git add index.html ipo-data.js chart-data.js ipo-analysis.js refresh_ipo_data.py build_ipo_analysis.py README.md LICENSE AGENTS.md docs/*.png
git commit -m "Update IPO site"
git push
```

After pushing, verify the live Worker route with a cache-busting query:

```sh
curl -I https://glaubi.net/ipo
curl -fsSL 'https://glaubi.net/ipo?v=<commit>' | rg 'LOW_MARKER_MIN_GAP_MINUTES'
! curl -fsSL 'https://glaubi.net/ipo?v=<commit>' | rg 'IPO return|Return —'
```

## License

MIT. See `LICENSE`.
