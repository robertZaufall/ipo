# IPO Site

Static first-day IPO chart page for `https://glaubi.net/ipo`.

The site shows large IPO companies as full-width cards with first-day candle charts, IPO/low reference lines, volume bars, and top timing analyses for when the first-day low tends to appear by elapsed time and 24-hour market clock time.

## Files

- `index.html` - static page, styles, chart renderer, search, and sort toggle.
- `ipo-data.js` - generated IPO card metadata.
- `chart-data.js` - generated Yahoo 5-minute first-day bars where available.
- `ipo-analysis.js` - generated 15-year low-timing analyses and expert-note links.
- `refresh_ipo_data.py` - refreshes IPO metadata, chart data, and analysis.
- `build_ipo_analysis.py` - rebuilds only `ipo-analysis.js` from existing generated data.

## Run Locally

```sh
python3 -m http.server 8080
```

Open `http://localhost:8080`.

## Refresh Data

```sh
python3 refresh_ipo_data.py --threshold-b 25 --limit 25
```

The refresh uses StockAnalysis for IPO metadata and Yahoo Finance chart endpoints for first-day OHLCV data. It writes all generated JavaScript data files.

Clock-time analysis is shown in US/Eastern 24-hour format, for example `09:30`, `13:00`, and `13:00-14:00`.

To rebuild only the derived analysis:

```sh
python3 build_ipo_analysis.py --input-dir . --output-dir .
```

## Verify

```sh
python3 -m py_compile refresh_ipo_data.py build_ipo_analysis.py
perl -0ne 'while(/<script>(.*?)<\/script>/sg){print $1}' index.html > /tmp/ipo-inline.js && node --check /tmp/ipo-inline.js
```

For visual QA, serve the page locally and check the header analysis, search, sort toggle, and at least the `CBRS` chart.

## Deploy

This repo is published through GitHub Pages at `https://robertzaufall.github.io/ipo/` and proxied to `https://glaubi.net/ipo`.

```sh
git add index.html ipo-data.js chart-data.js ipo-analysis.js refresh_ipo_data.py build_ipo_analysis.py README.md LICENSE AGENTS.md
git commit -m "Update IPO site"
git push
```

## License

MIT. See `LICENSE`.
