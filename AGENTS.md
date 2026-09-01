# AGENTS.md - IPO Site

This repo builds the static `ipo` page published at:

- Public URL: `https://glaubi.net/ipo`
- GitHub repo: `https://github.com/robertZaufall/ipo`
- Local site repo: `<local-ipo-site-repo>`
- Cloudflare Worker proxy source: `<local-ipo-proxy-repo>`

Path placeholders in this file are intentional. Substitute them with the matching local checkout paths in the active workspace.

## Current Shape

- The app is a static page: `index.html` plus generated `ipo-data.js`, `chart-data.js`, `ipo-analysis.js`, and `ipo-buy-signals.js`.
- `results.html` is a separate alternative one-minute entry-timing report linked from the main page. Its generated `results-data.js` bundle comes from the sibling IPO-analysis workspace. The optional TimesFM experiment uses `google/timesfm-3.0-pytorch` zero-shot on CPU; it is research-only and does not drive the live signal or the main chart buy states.
- There is no build step.
- Styling uses Tailwind from CDN plus local CSS in `index.html`.
- Candlestick charts are inline SVG generated in browser JavaScript.
- The 3D IPO map is a separate browser ES module in `three-ipo-view.js` and imports local Three.js from `vendor/three.module.min.js`. Keep `vendor/three.LICENSE.txt` with that module. Do not replace this with a remote charting or Three.js CDN unless explicitly requested.
- The top analysis panel is an inline SVG/HTML decision dashboard generated in browser JavaScript from precomputed cap-filtered data in `ipo-analysis.js`.
- The visible analysis UI starts with a buyer-window summary, decision-oriented KPI cards (`Sample`, `Typical low time`, `Buy bias`, and `Entry plan`), and a full-width elapsed-time opportunity map; below that it shows two larger distribution charts, a `Buy-plan questions` section, then an entry-scenario comparison table. The buy-plan section answers D1/D2 bias, staged buy count, allocation percentages, day-trade/swing suitability, open-chase suitability, dry-powder share, and best single fill. Do not re-add the removed `Timing signals` panel, old `Decision odds` panel, checkpoint highlight pill, duplicate `median clock` block, lower summary-pill row, or a trailing "not a buy signal" note unless explicitly requested.
- A compact infographic strip above the search row shows the IPO playbook and IPO buy-timing guides as small thumbnails. Both thumbnails open the full-size image modal when clicked.
- The header `Forthcoming IPOs` button opens a modal IPO-list of known upcoming listings from the StockAnalysis IPO calendar. This list is info-only and must stay excluded from timing samples, odds, charts, card filtering, and generated analysis. It shows the next 12 months of dated listings with date, symbol, company, exchange, price range, shares, deal, market cap, and revenue, plus `All` and active-cap-filter views.
- Runtime browser cache payloads are stored in IndexedDB, not origin-wide `localStorage`. The `ipo-site-cache-v1` database keeps path-namespaced records for Yahoo current quotes and the upcoming-IPO calendar; legacy `localStorage` keys are migration-only and should be removed after reading.
- The 3D map is opened from the analysis dashboard `3D Map` button. It supports Day 1 and Ext modes, open aligned / open+close / close aligned scaling, Reset View, Flatten Low, and hideable Symbols, Quick Read, Scale, and Selected panels. Automatic rotation is intentionally disabled.
- The 3D symbol selector is a hideable year-clustered top strip, newest IPO years on the left and oldest on the right. Each year uses two symbol columns when needed, but a single-symbol year should use one visual row. Symbol text color matches the line's up/down tone and does not use a separate bullet.
- In regular 3D path view, clicking a symbol pill selects it and overlays full candle bodies/wicks for that IPO; clicking the same selected symbol again isolates it into a one-row close-aligned candle view and hides other rows; clicking it again clears the selection and restores all rows. The isolated one-row view must switch to close aligned while active, restore the previous alignment when leaving, remove empty regular-session time before the first real price, normalize the return y-axis to that one IPO, and show linear 5-minute volume bars from the real bar volume field.
- In Flatten Low view, IPO lows are placed on a flat timing mesh with symbol labels. It should keep IPO open markers in white, show near-low markers from both regular and extended windows when real lows exist, omit fake extended markers when there is no extended-hours low, support open/open+close/close alignment without rotating the camera, show time labels plus IPO-year scale on the front, and draw the selected symbol arrow only after an explicit symbol-pill click.
- The entry-scenario comparison is calculated in browser JavaScript from the active cap/trading-place filtered exact 5-minute bars plus available extended/Day 2 bars. It reports average/min/max comparisons against End D1, median entry, absolute low, End D2, and, on card-local tables, runtime Current.
- Analysis distribution charts include dynamic median reference lines from the currently active cap and trading-place filter.
- Main candle charts include a top elapsed-minutes axis from first public trade, bottom NYC/German clock labels, and a blue vertical median timing reference line from the currently active analysis filter. They also show a thin gray horizontal first-public-open reference line with a plain `Open` label, plus conditional horizontal IPO-price and current-price reference lines only when those prices are inside the visible chart OHLC range.
- Main candle charts can overlay generated buy-signal states from `ipo-buy-signals.js`. Render these as an in-grid state strip with `Wait`, `Watch`, and `Buy` labels, never as a floating pill over the candles. `Wait` means predicted remaining downside is still above the watch threshold, `Watch` means it is within the watch band but not the buy threshold, and `Buy` means it is within the buy threshold. Use plain percentages in user-facing copy; the artifact stores basis-point values only for compact precision.
- The private 1-minute candle inputs, private dependencies, and XGBoost signal generator live in ignored `1m/`; only the exported `ipo-buy-signals.js` states/pins and public metadata should be committed unless explicitly requested.
- Each card chart has an enlarge button that opens the current per-card chart mode in a full-screen modal.
- The header includes a top-level analysis-range switch near the market and trading-place filters: `Day 1`, `Ext`, `D1 D2`, and `D1 Ext D2`. The default global analysis range is `D1 Ext`. It changes the global analysis only, not per-card chart drawings. Each main candle chart has its own top switch: `D1`, `D1 Ext`, `D1 Ext D2`, `D1 D2`, and `D2`. The default card chart mode is `D1 D2`.
- Stitched candle charts must not draw empty overnight gaps across the x-axis. Bottom x-axis labels stay clock-only, use half-hour/full-hour times where space allows, never show calendar dates, and may omit the far-right close label when space is tight. In `D1 D2`, keep the early Day 2 full-hour bottom label visible even if normal label filtering would remove it. The top axis uses first-trade elapsed time during the IPO day, resets to `0m` for after-hours, resets again at the start of second-day premarket, and resets again at D2 regular open; suppress the duplicate top-axis D2-open `0m` label in `D1 D2` because it overlaps the normal top labels. Extended trading-hour candle regions should have a subtle background shade.
- `D1 D2` charts show a thin light-gray vertical D2-open marker behind the candles, not blue and not above the candle layer.
- Candle hover cards use the compact old-style dialog layout, about half the width of the larger card design, and the dialog follows the mouse cursor vertically instead of locking to candle height.
- Visible chart source labels are compact provider markers: `(Y)` for Yahoo, `(A)` for Alpaca, and `(AV)` for Alpha Vantage. The generated `firstDayBarSources` and `extendedDayBarSources` values keep their full provider labels.
- IPO card company names link to their Yahoo Finance quote pages.
- IPO card header pills show market cap and, when available, deal size. Do not render the deal pill when `dealSize` is missing or non-positive.
- IPO cards use a price-level timeline instead of the old metric pill strip. Timeline events include `IPO`, `Start`, `Low`, `Median`, `End`, `After End`, `Pre D2`, `Open D2`, `End D2`, and `Current` when available, in true event-time order. `After End` is the last first-day after-hours close, `Pre D2` is the first second-trading-day premarket open, `Open D2` is the first regular-session opening print on the second trading day, and `End D2` is the final available second-day regular-session close. Do not re-add `Market cap` or `Deal size` to the price row because those values belong in the header pills.
- IPO cards include six micro charts below the price timeline: IPO to D1 close, D1 start to D1 close, D1 low to D1 close, start price to open D2, D1 close to Current, and D2 close to Current. First-day micro-chart paths use exact 5-minute closes. The Day-two micro chart extends the exact first-day path with generated extended-session and second-day milestones when available. Longer Current paths use sampled rough Yahoo weekly closes from `roughPriceSeries` when available, with endpoint fallback.
- IPO cards show an entry-scenario table below the micro charts for open, median, 30m, 60m, after-hours end, second-day premarket, second-day open, and second-day end entries when available. The table rows are `Vs End D1`, `Gap to median`, `Gap to low`, `Vs End D2`, and card-local `Vs Current`. `Gap to low` uses the absolute low over available D1/Ext/D2 candles. The `End D2` column shows `-` in the `Vs End D2` row. Omit unavailable scenario columns instead of rendering empty dash-only blocks. Do not add entry time or entry price to these controls unless explicitly requested.
- IPO cards do not render the generated IPO-to-current `dayChange` value. Do not re-add the top return pill or the `IPO return` metric unless explicitly requested.
- Main candle charts can show multiple low markers. The markers must be selected from the same near-low price range and every pair of selected marker times must be at least one hour apart.
- The market-cap and trading-place segmented filters sit in the header above the analysis panel so they control both the analysis and the card list. The default cap filter is `>$25B`; other cap options are `<$10B`, all (`*`), `>$10B`, and `>$50B`. The default trading-place filter is `All`; other options are `NASDAQ` and `NYSE`.
- The card toolbar below the analysis keeps only search plus the Date/Cap sort toggle.
- Do not reintroduce charting CDNs unless explicitly requested. Earlier chart-library attempts rendered blank in production.
- The chart path only draws real first-trading-day 5-minute OHLCV bars from `chart-data.js`. Suppress cards without exact bars; do not reintroduce daily-OHLC estimates or synthetic fallback charts unless explicitly requested.
- Use `refresh_ipo_data.py` to refresh the IPO list, first-day intraday bars, and derived timing analysis.
- Use `build_ipo_analysis.py` only when rebuilding the analysis from existing generated data without re-fetching market data.
- Use the ignored private `1m/build_buy_signals.py` only when regenerating public buy-signal states/pins from local 1-minute candles.

## Browser Cache Safety

- Keep browser persistence app-scoped and best-effort. A failed cache read/write must not blank the static page; catch quota and browser-storage errors, warn, and continue with in-memory or bundled fallback data.
- Keep `localStorage` limited to tiny synchronous startup state and one-time legacy migration reads. Do not add bulky payloads, chart data, calendar rows, quote snapshots, long per-symbol histories, or generated analysis to origin-wide `localStorage`.
- Store regenerable runtime payloads in the `ipo-site-cache-v1` IndexedDB database using path-namespaced record keys. The current runtime records are `current-quotes-v1` and `upcoming-calendar-v1`.
- Remove legacy `localStorage` cache keys after attempting migration. Do not mark a browser cache as fresh if the corresponding IndexedDB write failed.
- Prune runtime caches before persistence: current quotes stay capped to the most recent 300 symbols, and upcoming IPO rows stay limited to dated rows in the next 12 months with a 240-row cap.
- Keep the recovery UI scoped to this IPO app. Its clear-cache action should remove only this app's IndexedDB namespace and legacy IPO `localStorage` keys, not all origin storage, because other `glaubi.net` apps can share the same origin quota.

## Data Model

The page has four generated JavaScript data files plus one runtime quote cache:

- `ipos` in `ipo-data.js`: one object per IPO candidate/card; the page renders only entries with exact `firstDayBars`.
- `firstDayBars` in `chart-data.js`: optional real first-trading-day 5-minute OHLCV bars keyed by ticker.
- `firstDayBarSources` in `chart-data.js`: per-ticker provider labels such as `Yahoo 5m bars`, `Alpaca SIP 5m bars`, or `Alpha Vantage 5m bars`.
- `extendedDayBars` in `chart-data.js`: optional Alpaca 5-minute OHLCV bars for first-day after-hours and next-day premarket/open handoff rows, keyed by ticker.
- `extendedDayBarSources` in `chart-data.js`: per-ticker provider labels such as `Alpaca SIP extended 5m bars`.
- `secondDayBars` in `chart-data.js`: optional Alpaca 5-minute OHLCV bars for the second regular trading day, keyed by ticker.
- `secondDayBarSources` in `chart-data.js`: per-ticker provider labels such as `Alpaca SIP second-day 5m bars`.
- `roughPriceSeries` in `chart-data.js`: optional sampled Yahoo weekly close rows keyed by ticker for rough long-range micro-chart paths.
- `current-price-cache.json`: bundled Yahoo current-price cache used as a browser runtime seed before fresh Yahoo proxy quotes arrive.
- `ipoAnalysis` in `ipo-analysis.js`: derived 15-year first-day low timing analysis, probability checkpoints, and timing insights precomputed for each cap and trading-place filter.
- `ipoBuySignals` in `ipo-buy-signals.js`: public chart-ready buy-signal pins keyed by ticker. Pins are reserved for threshold buys and time-based forced entries.
- `ipoBuySignalSeries` in `ipo-buy-signals.js`: public chart-ready Day 1 and Day 2 signal-state ticks keyed by ticker. Each state includes time, session, elapsed minutes, predicted remaining downside bps, threshold bps, watch threshold bps, state (`wait`, `watch`, or `buy`), and model id.
- `ipoBuySignalMeta` in `ipo-buy-signals.js`: public metadata for the generated buy-signal artifact. Keep raw 1-minute candles, local dependencies, and the private generator in ignored `1m/`.
  Current public model metadata: `modelId` is `ipo-minute-xgboost-downside-v1`, engine is `xgboost.XGBRegressor`, target is remaining regular-session downside from the next executable open to that session's remaining low for Day 1 or Day 2, `buyThresholdBps` is `45` (0.45%), `watchThresholdBps` is `150` (1.50%), `forceBuyMinute` is `180`, and `seriesStepMinutes` is `5`.

IPO object fields:

- `ticker`
- `name`
- `date` - first trading date, `YYYY-MM-DD`
- `exchange`
- `sector`
- `ipoPrice` - offer price in USD
- `current` - latest quote price refreshed from Yahoo Finance chart metadata when available; StockAnalysis price remains the fallback. Browser JavaScript refreshes this again at runtime through the Yahoo proxy and labels it as `Current`.
- `currentAsOf`, `currentSource`, `currentCurrency` - quote provenance for `current`
- `marketCap` - billions USD
- `dealSize` - millions USD raised
- `dayChange` - percent from IPO price to current price; generated for compatibility but intentionally not rendered in card UI
- `firstDay` - optional Yahoo daily OHLC reference, not used for chart rendering

`firstDayBars` row format:

```js
["12:55", open, high, low, close, volume]
```

`extendedDayBars` row format:

```js
["2026-05-15 16:05", open, high, low, close, volume]
```

`secondDayBars` row format:

```js
["2026-05-16 09:30", open, high, low, close, volume]
```

`roughPriceSeries` row format:

```js
["2026-05-26", close]
```

`ipoAnalysis` includes:

- Top-level `defaultFilter`, `defaultTradingPlaceFilter`, `filters`, `tradingPlaceFilters`, `byCap`, and `byFilter`.
- `byCap.under10`, `byCap.all`, `byCap.gt10`, `byCap.gt25`, and `byCap.gt50`, each with its own precomputed probability sample for all trading places.
- `byFilter.<cap>.<tradingPlace>` contains precomputed samples for cap plus trading-place combinations such as `byFilter.gt10.nasdaq` and `byFilter.gt10.nyse`.
- Inside each cap analysis: `cutoffDate`, `sampleSize`, `sourceCounts`, `medianDeltaMinutes`, `firstHourPct`, `afterTwoHoursPct`, `buckets`, `clockBuckets`, `decisionCheckpoints`, `decisionInsights`, and per-symbol `records`.
- Clock-time labels use 24-hour format with German local time in the same label, for example `13:00 (DE 19:00)` or two-line labels `13:00` plus `19:00 (DE)`. The market-clock distribution chart omits the trailing `(DE)` suffix on its lower German axis labels to prevent crowding.
- Top-level `expertNotes` retains researched source URLs for provenance; they are not currently rendered in the page UI.

## Data Gathering Method

The last full refresh was done on 2026-05-31. Alpaca extended-hours and second-day candle data were added by the 2026-05-31 refresh. Runtime current-price refreshes are handled in browser JavaScript through the Yahoo proxy.

Primary candidate source:

- `https://stockanalysis.com/stocks/screener/`
- Use symbols whose current market cap is above `$5B` and whose StockAnalysis company profile has an IPO date.
- Also include every IPO after 2020 with current market cap above `$5B`, using StockAnalysis yearly IPO archive pages.
- Exclude IPOs whose known first-day start/open price is below `$1`; the default script threshold is `--min-start-price 1`.
- Exclude `VG` / Venture Global by default because Yahoo currently returns missing or wrong first-day prices.
- `CBRS` is force-added to the candidate set by default and must remain included when it qualifies; `CRBS` is a common typo, but the correct ticker is `CBRS`.
- `refresh_ipo_data.py` can still scan only yearly IPO archive pages with `--source yearly` or `--year`, but the default source is the combined screener + post-2020 archive set.

Per-ticker detail source:

- `https://stockanalysis.com/stocks/<ticker>/`
- `https://stockanalysis.com/stocks/<ticker>/company/`
- Pull or verify market cap, IPO price/date, exchange, sector/industry, and related company fields from the StockAnalysis ticker pages when available.
- Refresh the generated current snapshot price from Yahoo Finance latest chart metadata during data generation; if Yahoo is unavailable for a ticker, keep the StockAnalysis fallback value. Browser runtime code refreshes Current again through the Yahoo proxy and caches results in path-namespaced IndexedDB records.
- When adding a new symbol or refreshing symbol data, update the public data snapshot date in the footer of `index.html` so the visible freshness term matches the data actually shown.
- Fetch sampled Yahoo weekly closes for `roughPriceSeries`; these are only used for small micro-chart shape hints, not for main candle charts or low-timing analysis.
- For `CBRS`, also checked Cerebras' own IPO pricing release:
  `https://www.cerebras.ai/press-release/cerebras-systems-announces-pricing-of-initial-public-offering`

Upcoming IPO-list source:

- `https://stockanalysis.com/ipos/calendar/`
- The browser fetches a markdown copy through:
  `https://r.jina.ai/http://https://stockanalysis.com/ipos/calendar/`
- Parsed rows are cached in IndexedDB under the path-namespaced `upcoming-calendar-v1` record with a 24-hour retry/freshness window. The legacy `ipo-upcoming-calendar-v1` `localStorage` key is only a one-time migration source.
- Only dated rows in the next 12 months are shown. The modal can show all upcoming rows or rows matching the active market-cap filter.
- Upcoming rows must remain informational only. Do not feed them into `ipos`, `ipoAnalysis`, timing samples, chart cards, buy-plan questions, or entry-scenario analysis.

Intraday candle source:

- Yahoo Finance chart endpoint, example:
  `https://query1.finance.yahoo.com/v8/finance/chart/CBRS?period1=<epoch>&period2=<epoch>&interval=5m&includePrePost=false&events=history`
- Alpaca market data historical stock bars are used as the primary fallback when paper/data credentials are available from `APCA_API_KEY_ID` plus `APCA_API_SECRET_KEY`, or compatible `ALPACA_*` names.
- Alpaca bars endpoint example:
  `https://data.alpaca.markets/v2/stocks/bars?symbols=ARM&timeframe=5Min&start=<rfc3339>&end=<rfc3339>&adjustment=raw&feed=sip`
- Alpaca is also used for optional extended-hours and second-day chart data. Fetch extended bars from the first trading date at 16:00 ET through the next premarket/open handoff as available and store those rows in `extendedDayBars` with `YYYY-MM-DD HH:MM` New York timestamps. Fetch the second regular trading day into `secondDayBars`, including the regular-session close when available.
- One-minute candle experiments live in the ignored local `1m/` folder. Keep both the gathering script and generated symbol-specific `*-first-day-1min-candles.json` and `*-second-day-1min-candles.json` files there unless the user explicitly asks to publish them.
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
- Clock-time buckets are based on US/Eastern market time and should show dual NYC plus German labels in `HH:MM (DE HH:MM)` format, with two-line labels allowed where space is tight as `HH:MM` plus `HH:MM (DE)`. The market-clock distribution axis may omit the trailing `(DE)` suffix on the German line only. Generate German labels in Python with `Europe/Berlin` timezone conversion rather than a hard-coded offset because US/EU daylight-saving changes do not always align.
- Current expert-note research sources:
  - SEC Investor.gov IPO bulletin: `https://www.sec.gov/files/ipo-investorbulletin.pdf`
  - Schwab IPO basics: `https://www.schwab.com/learn/story/ipo-basics-what-to-know-before-investing`
  - Fidelity IPO FAQ: `https://www.fidelity.com/stock-trading/faqs-ipos`

Buy-signal source:

- `1m/build_buy_signals.py` reads ignored one-minute Day 1 and Day 2 regular-session candles from `1m/*-first-day-1min-candles.json` and `1m/*-second-day-1min-candles.json`, trains `ipo-minute-xgboost-downside-v1`, and writes only public chart-ready data to `ipo-buy-signals.js`. It can still fall back to the old combined JSON shape when no symbol-specific Day 1 files are present.
- The model frames entry timing as remaining downside estimation, not as a binary "stock is good" classifier. At each minute it predicts how far the next executable open may still be above the remaining low for the active Day 1 or Day 2 regular session.
- The public output is safe to commit because it contains only aggregate metadata, 5-minute signal states, selected pins, prices, thresholds, and model id. It must not include raw one-minute candles, feature tables, local dependency folders, credentials, or private generator code.
- XGBoost is used because the minute-level IPO signal is tabular, nonlinear, and small enough that boosted trees can combine timing, price-action, range, wick, volume, and momentum patterns without assuming a linear relationship.

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
cd <local-ipo-site-repo>
python3 -m http.server 8080
```

Then open:

```text
http://localhost:8080
```

Most page layout, candle chart, dashboard, and IPO-list behavior edits are made directly in `index.html`; the 3D map lives in `three-ipo-view.js`; generated IPO metadata lives in `ipo-data.js`, real candle rows live in `chart-data.js`, derived low-timing analysis lives in `ipo-analysis.js`, and public buy-signal states/pins live in `ipo-buy-signals.js`.

Refresh the default combined `$5B+` data set with:

```sh
cd <local-ipo-site-repo>
python3 refresh_ipo_data.py --threshold-b 5 --limit 500 --candidate-limit 1000
```

Rebuild only the derived analysis from existing generated data with:

```sh
cd <local-ipo-site-repo>
python3 build_ipo_analysis.py --input-dir . --output-dir .
```

Regenerate only the public buy-signal states/pins from ignored local 1-minute candles with:

```sh
cd <local-ipo-site-repo>
python3 1m/build_buy_signals.py --input-dir 1m --output ipo-buy-signals.js
```

## Deploy Site

The site repo is Git-backed and pushes to GitHub. The live `https://glaubi.net/ipo` route uses the Cloudflare Worker proxy to fetch the latest static files from GitHub raw `main`; GitHub Pages is intentionally disabled and should not be treated as a production target.

```sh
cd <local-ipo-site-repo>
git status --short
git add .gitignore index.html three-ipo-view.js vendor/three.module.min.js vendor/three.LICENSE.txt ipo-data.js chart-data.js current-price-cache.json ipo-analysis.js ipo-buy-signals.js refresh_ipo_data.py build_ipo_analysis.py AGENTS.md README.md LICENSE docs/*.png
git commit -m "Update IPO site"
git push
```

After pushing, verify:

```sh
curl -I https://glaubi.net/ipo
curl -fsSL 'https://glaubi.net/ipo?v=<commit>' | rg 'LOW_MARKER_MIN_GAP_MINUTES'
! curl -fsSL 'https://glaubi.net/ipo?v=<commit>' | rg 'IPO return|Return —'
```

Use a cache-busting query when visually checking:

```text
https://glaubi.net/ipo?v=<commit>
```

## Cloudflare Worker Proxy

Do not delete `<local-ipo-proxy-repo>` unless the proxy is moved into the site repo or the Cloudflare route is intentionally removed.

The live `glaubi.net/ipo` route depends on the Worker source in that folder:

- Worker name: `ipo-proxy`
- Config: `<local-ipo-proxy-repo>/wrangler.toml`
- Worker code: `<local-ipo-proxy-repo>/index.mjs`
- Routes:
  - `glaubi.net/ipo`
  - `glaubi.net/ipo*`
  - `glaubi.net/ipo/*`

The Worker maps hidden-path requests to GitHub raw `main`:

```text
https://glaubi.net/ipo     -> https://raw.githubusercontent.com/robertZaufall/ipo/main/index.html
https://glaubi.net/ipo/... -> https://raw.githubusercontent.com/robertZaufall/ipo/main/...
```

It also sets content types for static assets, strips restrictive raw GitHub CSP headers, applies a short public cache, and injects:

```html
<base href="/ipo/">
```

into HTML responses when needed.

Deploy proxy changes with:

```sh
cd <local-ipo-proxy-repo>
npx wrangler deploy
```

Check deployed Worker history:

```sh
cd <local-ipo-proxy-repo>
npx wrangler deployments list --name ipo-proxy
```

## Glaubinet Index

The route index card for this page lives in:

```text
<local-glaubinet-repo>/index.html
```

Use the `glaubinet` skill/workflow when changing public `glaubi.net` mappings. For this page the index currently points `/ipo` to:

```text
Major IPOs - First-Day Charts
```

## Verification Checklist

Before calling an IPO change done:

- `index.html` still renders without a build step.
- `ipo-data.js` includes `$5B+` IPO candidates from the cap screener plus all post-2020 `$5B+` IPO archive matches.
- `ipo-analysis.js` is generated from `build_ipo_analysis.py` and contains precomputed `byCap` plus `byFilter` analyses for all cap and trading-place filters.
- `ipo-buy-signals.js` is generated from private ignored `1m/` inputs and contains only public chart-ready signal states/pins, not raw minute candles or private model code.
- The header cap, trading-place, and analysis-range filters sit above the analysis and change the rendered analysis and card list appropriately.
- The top analysis panel shows decision-oriented KPI cards, elapsed-time/candle-time distribution, and US/Eastern plus German clock/session distribution for the active analysis range, with the elapsed-time opportunity map using the full panel width.
- The compact infographic strip above search shows both the IPO playbook and buy-timing thumbnails, and both open the full-size image modal.
- The analysis panel shows `Buy-plan questions` below the bar charts, without the removed `Decision odds`, `Timing signals`, checkpoint highlight pill, duplicate median-clock header block, lower summary-pill row, or generic disclaimer row.
- The analysis panel shows the global entry-scenario comparison after `Buy-plan questions`, including open, median, 30m, 60m, after-hours end, second-day premarket, second-day open, and second-day end scenarios with wrapping text that is not clipped. The global table omits `Vs Current`.
- Analysis charts show dynamic median reference lines for the active filter.
- Clock-time chart labels use 24-hour NYC and German labels, not AM/PM labels. Two-line labels are allowed, and the market-clock distribution chart omits trailing `(DE)` on German axis labels.
- No included IPO has a known `firstDay.open` below `$1`.
- `CBRS` is present and its chart uses real Yahoo 5-minute bars and does not begin at `$185`.
- Main candle charts show the top elapsed-minutes axis, active-filter median timing line, buy-signal states/pins when available, compact provider marker, thin gray open-price reference line, compressed no-candle gap markers when needed, and only show IPO-price/current-price horizontal reference lines when those values are within that chart's visible OHLC range.
- Each card chart enlarge button opens a full-screen chart modal using the same chart data mode currently active for that card.
- The global `Day 1` / `Ext` / `D1 D2` / `D1 Ext D2` switch changes the analysis range and defaults to `D1 Ext`. Card-level `D1` / `D1 Ext` / `D1 Ext D2` / `D1 D2` / `D2` switches change chart drawings without changing search/filter behavior and default to `D1 D2`. Card-level extended and Day 2 price timeline events and entry scenario columns use generated Alpaca data directly.
- Low markers on main candle charts are in the same near-low price band and are spaced at least one hour apart.
- The `Forthcoming IPOs` modal opens from the header, renders the StockAnalysis-derived IPO-list or a clear unavailable/empty state, keeps rows info-only, and updates when switching between `All` and the active cap filter.
- The 3D map opens from the analysis panel, loads local `vendor/three.module.min.js`, and renders without a blank WebGL canvas.
- The 3D map symbol strip is clustered by IPO year with newest years on the left, compact two-column symbol groups, and all visible symbols reachable without a horizontal scrollbar.
- In regular 3D path view, symbol selection shows candle bodies/wicks for the selected IPO; a second click isolates that IPO into the one-row candle view; a third click clears isolation and selection.
- The isolated one-row 3D render is close-aligned while active, restores the prior alignment when leaving, removes empty time before the first real price, uses the selected IPO's own return range, and shows linear 5-minute volume bars.
- Flatten Low view shows the flat low mesh, time labels, IPO-year scale, white IPO-open markers, real regular and extended near-low markers, no fake extended marker at the start of the extended session, and stable camera orientation when changing Day 1/Ext or alignment.
- IPO cards link company names to Yahoo Finance quote pages, show cap/deal header pills, and use the price-level timeline for `IPO`, `Start`, `Low`, `Median`, `End`, `After End`, `Pre D2`, `Open D2`, `End D2`, and `Current` events when available.
- IPO cards show an entry-scenario table below the six micro charts, with first-day scenarios (`Open`, `Median`, `30m`, `60m`) plus extended/Day 2 scenarios (`After`, `Pre D2`, `Open D2`, `End D2`). `Vs Current` is present only in card-local tables, separated with a dashed row line.
- IPO cards do not show `IPO return`, `Return —`, generated `dayChange`, `Market cap`, or `Deal size` in the price timeline or entry controls.
- Missing exact 5-minute bars are suppressed from the card list, not rendered as estimated charts.
- Search filters cards by ticker/company/exchange/sector.
- Sort button toggles between IPO date recent-first and market cap biggest-first.
- Micro-chart lines use rough real paths: exact 5-minute closes for first-day cards, exact first-day closes plus extended/Day 2 milestones for the Start-to-open-D2 card, and sampled Yahoo weekly closes from `roughPriceSeries` for Current cards when available.
- Cap filter defaults to `>$25B` and can switch to `<$10B`, all (`*`), `>$10B`, and `>$50B`.
- Trading-place filter defaults to `All` and can switch to `NASDAQ` or `NYSE`.
- Inline JavaScript syntax still passes, for example:
  `perl -0ne 'while(/<script>(.*?)<\/script>/sg){print $1}' index.html > /tmp/ipo-inline.js && node --check /tmp/ipo-inline.js`
- The 3D map module still parses, for example:
  `node --input-type=module --check < three-ipo-view.js`
- Python scripts compile:
  `python3 -m py_compile refresh_ipo_data.py build_ipo_analysis.py`
- If the private `1m/` generator was changed, it compiles:
  `python3 -m py_compile 1m/build_buy_signals.py`
- `https://glaubi.net/ipo` returns the page, not a 404.
- `https://glaubi.net/ipo?v=<commit>` visually shows candles and serves the current GitHub raw `main` content through the Worker.
