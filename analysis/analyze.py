"""選股分析：套用「3 月前段班 + 1 月贏大盤」邏輯，輸出 results.json 供網頁讀取。

選股邏輯（與使用者議定）：
  1. 近 3 個月報酬排名進「前 1/3」（前段班）           ← 基本門檻
  2. 近 1 個月報酬「贏過大盤(TAIEX)同期」              ← 最重要
  排序：依「近 1 個月超額報酬 = 基金1月 − 大盤1月」由大到小，最高者為首選。
"""

import json
import math
import os
from datetime import datetime, timezone, timedelta

from scraper import fetch_funds, fetch_benchmark

ROOT = os.path.dirname(os.path.dirname(__file__))
OUT = os.path.join(ROOT, "results.json")
FUNDS_OUT = os.path.join(ROOT, "funds.json")

# 由各期報酬重建「績效指數曲線」（現在=100，往回推），給看板畫真實走勢用
PERF_TENORS = [("r5y", "5年"), ("r3y", "3年"), ("r1y", "1年"),
               ("r6m", "6月"), ("r3m", "3月"), ("r1m", "1月")]


def perf_series(f):
    pts = []
    for key, label in PERF_TENORS:
        r = f.get(key)
        if r is not None:
            pts.append({"label": label + "前", "value": round(100.0 / (1 + r / 100.0), 2)})
    pts.append({"label": "現在", "value": 100.0})
    return pts


def analyze(funds, bench):
    b1m = bench.get("r1m")

    # 選股池：僅國內股票 + 平衡（pick=True），且近 1/3 月皆有數據
    universe = [f for f in funds if f.get("pick") and f["r1m"] is not None and f["r3m"] is not None]
    universe.sort(key=lambda f: f["r3m"], reverse=True)
    n = len(universe)

    # 步驟 1：近 3 月前 1/3
    cutoff = max(1, math.ceil(n / 3)) if n else 0
    top_third = universe[:cutoff]
    r3m_cut = top_third[-1]["r3m"] if top_third else None

    # 步驟 2：近 1 月贏大盤（大盤資料缺失時，退而只比大於 0）
    bench_ref = b1m if b1m is not None else 0.0
    survivors = [f for f in top_third if f["r1m"] > bench_ref]

    # 排序：近 1 月超額報酬由大到小
    for f in survivors:
        f["excess"] = round(f["r1m"] - bench_ref, 2)
    survivors.sort(key=lambda f: f["excess"], reverse=True)
    for i, f in enumerate(survivors, 1):
        f["rank"] = i

    now = datetime.now(timezone(timedelta(hours=8)))  # 台北時間
    result = {
        "generated_at": now.strftime("%Y-%m-%d %H:%M"),
        "benchmark": bench,
        "benchmark_missing": b1m is None,
        "universe_size": n,
        "top_third_cutoff": cutoff,
        "r3m_cutoff": r3m_cut,
        "criteria": {
            "step1": "近 3 個月報酬排名前 1/3",
            "step2": "近 1 個月報酬 > 大盤(TAIEX)近 1 月報酬",
            "sort": "近 1 個月超額報酬 (基金1月 − 大盤1月) 由大到小",
        },
        "picks": survivors,
        # 附帶完整前段班供網頁顯示對照（含未通過第 2 關者）
        "top_third": [
            {**f, "beat_market": f["r1m"] > bench_ref} for f in top_third
        ],
    }
    return result


def build_funds_json(funds):
    """全部抓到的基金（含真實各期報酬與重建走勢），供首頁行情看板使用。"""
    out = []
    for f in funds:
        if f["r1m"] is None and f["r3m"] is None:
            continue
        out.append({
            "code": f["code"], "name": f["name"], "company": f["company"],
            "category": f["category"], "group": f["group"],
            "r1m": f["r1m"], "r3m": f["r3m"], "r6m": f["r6m"],
            "r1y": f["r1y"], "r3y": f["r3y"], "r5y": f["r5y"],
            "perf": perf_series(f),
        })
    now = datetime.now(timezone(timedelta(hours=8)))
    return {"generated_at": now.strftime("%Y-%m-%d %H:%M"), "count": len(out), "funds": out}


def main():
    funds = fetch_funds()
    bench = fetch_benchmark()

    result = analyze(funds, bench)
    with open(OUT, "w", encoding="utf-8") as fp:
        json.dump(result, fp, ensure_ascii=False, indent=2)

    funds_data = build_funds_json(funds)
    with open(FUNDS_OUT, "w", encoding="utf-8") as fp:
        json.dump(funds_data, fp, ensure_ascii=False)
    print(f"看板基金資料 {funds_data['count']} 檔 → {FUNDS_OUT}")

    picks = result["picks"]
    print(f"基金池 {result['universe_size']} 檔；前1/3 取 {result['top_third_cutoff']} 檔；"
          f"大盤近1月 {result['benchmark']['r1m']}%")
    if picks:
        top = picks[0]
        print(f"★ 首選：{top['name']}（{top['company']}） "
              f"1月 {top['r1m']}% / 3月 {top['r3m']}% / 超額 {top['excess']}%")
        print(f"共 {len(picks)} 檔通過。已寫入 {OUT}")
    else:
        print("本日無符合條件基金。")


if __name__ == "__main__":
    main()
