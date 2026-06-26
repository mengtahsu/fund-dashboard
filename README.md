# 基金行情看板 + 今日選基金

純前端（GitHub Pages）+ Python 分析（GitHub Actions）的台股基金工具。

- **行情看板** `index.html`：基金排行、類別篩選、淨值走勢圖（示範資料）。
- **今日選基金** `pick.html`：依「3 月前段班 × 1 月贏大盤」選股邏輯，顯示分析結果。

🔗 線上：https://mengtahsu.github.io/fund-dashboard/

## 選股邏輯

1. 近 3 個月報酬排名進「前 1/3」（前段班）— 基本門檻
2. 近 1 個月報酬「贏過大盤（TAIEX）同期」— 最重要
3. 排序：依「近 1 個月超額報酬（基金1月 − 大盤1月）」由大到小，最高者為首選

## 資料管線（C+A 混合架構）

```
MoneyDJ 基金排行(Big5)  ─┐
                         ├─► analysis/scraper.py ─► analysis/analyze.py ─► results.json ─► pick.html
Yahoo ^TWII / TWSE 大盤 ─┘
```

- `analysis/scraper.py`：抓 MoneyDJ 基金近 1/3 月報酬 + 台股加權指數同期報酬。**純標準庫，無需 pip。**
- `analysis/analyze.py`：套用選股邏輯，輸出 `results.json`。
- `.github/workflows/analyze.yml`：
  - **C**：每日 18:00（台北）排程自動跑。
  - **A**：`workflow_dispatch` 手動觸發（Actions 頁面 → Run workflow）。
  - 跑完把 `results.json` commit 回 `main`，GitHub Pages 自動重新部署。

## 本機執行

```sh
python3 analysis/analyze.py          # 抓資料 + 分析，產生 results.json
python3 -m http.server 8000          # 開 http://localhost:8000
```

## 待辦 / 已知限制

- **基金池涵蓋度**：目前 `CATEGORIES` 只含已驗證的「國內股票型」端點（約 33 檔，偏科技類）。
  「平衡型」及其他子分類的 A/B 代碼待補（MoneyDJ 分類選單為 JS 動態載入，需逐一確認）。
- **一鍵觸發**：公開 repo 無法在前端安全內嵌 token，故網頁按鈕目前導向結果頁；
  即時重跑請到 Actions 頁手動 Run，或日後加一層 serverless proxy 保管 token。

> ⚠️ 所有輸出僅供參考，非投資建議。
