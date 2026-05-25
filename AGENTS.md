# AGENTS.md - IPO Site

This repo builds the static `ipo` page published at:

- Public URL: `https://glaubi.net/ipo`
- GitHub Pages upstream: `https://robertzaufall.github.io/ipo`
- GitHub repo: `https://github.com/robertZaufall/ipo`
- Local site repo: `/Users/master/clawd/projects/ipo-site`
- Cloudflare Worker proxy source: `/Users/master/clawd/projects/ipo-proxy`

## Current Shape

- The app is a single static file: `index.html`.
- There is no build step.
- Styling uses Tailwind from CDN plus local CSS in `index.html`.
- Candlestick charts are inline SVG generated in browser JavaScript.
- Do not reintroduce charting CDNs unless Rob explicitly asks. Earlier chart-library attempts rendered blank in production.
- The current chart path embeds real Yahoo Finance 5-minute bars where available and falls back to a visibly estimated SVG only when intraday history is unavailable.

## Data Model

`index.html` contains two main JavaScript data blocks:

- `ipos`: one object per IPO card.
- `firstDayBars`: optional real first-trading-day 5-minute OHLCV bars keyed by ticker.

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

`firstDayBars` row format:

```js
["12:55", open, high, low, close, volume]
```

## Data Gathering Method

The last refresh was done on 2026-05-25.

Primary IPO list source:

- `https://stockanalysis.com/ipos/2026/`
- Use the most recent IPOs with capital raised / deal size above `$50M`.
- Rob originally said "cap > $50B", but that only yields almost nothing in the recent IPO set. The implemented selection uses deal size above `$50M`; market cap is still displayed and used for the "capitalization biggest first" sort.

Per-ticker detail source:

- `https://stockanalysis.com/stocks/<ticker>/`
- Pull or verify current price, market cap, IPO price/date, and related company fields from the StockAnalysis ticker page when available.
- For `CBRS`, also checked Cerebras' own IPO pricing release:
  `https://www.cerebras.ai/press-release/cerebras-systems-announces-pricing-of-initial-public-offering`

Intraday candle source:

- Yahoo Finance chart endpoint, example:
  `https://query2.finance.yahoo.com/v8/finance/chart/CBRS?range=1mo&interval=5m&includePrePost=false&events=history`

Process for real first-day bars:

1. Fetch Yahoo `chart.result[0]`.
2. Convert timestamps to US/Eastern market times.
3. Keep only rows whose local date equals the IPO first trading date.
4. Read `quote.open/high/low/close/volume`.
5. Drop rows with missing OHLC values.
6. Drop zero-volume offer-price placeholder rows. For `CBRS`, Yahoo included `$185` zero-volume rows before real trading; those are wrong for the visible first-day chart.
7. Store rows as compact arrays in `firstDayBars`.

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

Because this is a one-file static page, most edits are made directly in `index.html`.

## Deploy Site

The site repo is Git-backed and pushes to GitHub Pages:

```sh
cd /Users/master/clawd/projects/ipo-site
git status --short
git add index.html AGENTS.md
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
- `CBRS` chart uses real Yahoo 5-minute bars and does not begin at `$185`.
- Search filters cards by ticker/company/exchange/sector.
- Sort button toggles between IPO date recent-first and market cap biggest-first.
- `https://glaubi.net/ipo` returns the page, not a 404.
- `https://glaubi.net/ipo?v=<commit>` visually shows candles.

