# GoldShovel

GoldShovel is a minimal, interactive data visualization site that tracks where top U.S.-based venture firms appear to be allocating money based on recent public web signals.

## Architecture
- Frontend: static site (`index.html`, `app.js`, `styles.css`)
- Data source registry: `data/vc_firms.json` (100 U.S.-based VC firms)
- Data pipeline: `scripts/fetch-vc-flows.mjs`
- Frontend dataset: `data/deals.json`
- Automation: GitHub Actions workflows in `.github/workflows/`

## Run Locally
```bash
cd "/Users/michaelsinger/Documents/New project"
npm run refresh:data:demo
npm run serve
```
Open [http://localhost:4173](http://localhost:4173).

## Test Live Scraping Locally
Quick test:
```bash
npm run refresh:data -- --vc-limit=10 --per-vc=3 --lookback=30
```
Then inspect `data/deals.json`:
- `meta.requests_succeeded`
- `meta.requests_failed`
- `meta.error_sample`
- `meta.note`

If your network blocks scraping, use demo fallback:
```bash
npm run refresh:data:demo
```

## GitHub Automation Chain (No Finder Workflow)
This repo includes:
- `refresh-vc-data.yml`: runs scraper every 6 hours and commits `data/deals.json`
- `deploy-pages.yml`: deploys the static site to GitHub Pages on push

### 1) Connect your personal GitHub account
`gh` CLI is not required. Use normal git auth prompt:
```bash
cd "/Users/michaelsinger/Documents/New project"
git add .
git commit -m "Initial GoldShovel setup"
git branch -M main
git remote add origin https://github.com/<your-username>/goldshovel.git
git push -u origin main
```
When prompted, authenticate with your GitHub account (browser/credential manager/PAT depending on your local git setup).

### 2) Enable workflow write permissions
In GitHub repo settings:
- Settings -> Actions -> General
- Workflow permissions: **Read and write permissions**

### 3) Enable GitHub Pages
In GitHub repo settings:
- Settings -> Pages
- Build and deployment -> Source: **GitHub Actions**

### 4) Trigger first data refresh
- GitHub -> Actions -> `Refresh VC Data` -> Run workflow

After refresh commits `data/deals.json`, `Deploy GoldShovel Site` publishes the frontend.

## Important Caveat
This is directional intelligence, not definitive private-market truth. Treat scraped signals as probabilistic, not exact.

## Back Burner (Trading App)
Trading automation is intentionally paused until data quality, methodology, and signal stability are strong enough to justify execution risk.
