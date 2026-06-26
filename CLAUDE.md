# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Taiwan-fund web tool: a static **dashboard** (GitHub Pages) plus a **Python analysis pipeline** (GitHub Actions). UI strings are Traditional Chinese. Repo: `mengtahsu/fund-dashboard` (public). Live: https://mengtahsu.github.io/fund-dashboard/

Two pages:
- `index.html` — 行情看板 (fund ranking table + category filter + NAV chart). Uses **demo data** from `js/data.js` (seeded random walk), not live data.
- `pick.html` — 今日選基金, renders `results.json` produced by the analysis pipeline (live data).

## Architecture (C+A hybrid)

```
MoneyDJ 基金排行 (Big5)  ─┐
                          ├─► analysis/scraper.py ─► analysis/analyze.py ─► results.json ─► pick.html
Yahoo ^TWII / TWSE 大盤  ─┘
```

- **`analysis/scraper.py`** — scrapes MoneyDJ ranking pages (Big5-encoded `.djhtm`; fund returns live in static `<tr>` rows, header is "一個月(%)/三個月(%)…") and the TAIEX benchmark (Yahoo `^TWII` primary, TWSE OpenAPI fallback). **Standard library only — no pip deps** (keep it that way so Actions stays fast/robust).
- **`analysis/analyze.py`** — applies the selection logic, writes `results.json` at repo root.
- **`.github/workflows/analyze.yml`** — daily `schedule` (台北 18:00 / UTC 10:00) + `workflow_dispatch`; commits `results.json` back to `main`, which auto-redeploys Pages.

## Selection logic (agreed with user — preserve when editing)

Universe = MoneyDJ 國內股票型 + 平衡型 funds. Steps:
1. 近 3 個月報酬 rank in **top 1/3** of universe (基本門檻).
2. 近 1 個月報酬 **> TAIEX 近 1 月報酬** (beat the market — most important).
3. Sort survivors by **excess = fund r1m − benchmark r1m**, descending. Top = pick.

If benchmark is missing, step 2 degrades to `> 0%`.

## Key facts / gotchas

- **MoneyDJ is Big5**: always `.decode("big5", "ignore")`. The ranking table data IS in the static HTML (the column *headers* are JS-rendered, the row values are not).
- **Fund category codes**: ranking URL is `yp401000.djhtm?A=ET001001&B=806`. The category menu is loaded by JS from a separate endpoint, so codes aren't easily enumerable. `CATEGORIES` in `scraper.py` currently holds only the verified 國內股票型 endpoint (~33 funds, tech-heavy); 平衡型 + others are a TODO.
- **No build step**: pure static site + stdlib Python. Test locally with `python3 analysis/analyze.py` then `python3 -m http.server`.
- Shared theme in `css/styles.css` (CSS variables); Asian color convention **紅漲綠跌** (`--up` red, `--down` green).

## Commands

```sh
python3 analysis/analyze.py     # scrape + analyze → results.json
python3 -m http.server 8000     # serve site at localhost:8000
```
