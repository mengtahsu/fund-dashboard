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

OUT = os.path.join(os.path.dirname(os.path.dirname(__file__)), "results.json")


def analyze():
    funds = fetch_funds()
    bench = fetch_benchmark()
    b1m = bench.get("r1m")

    # 只取近 1 月與 3 月皆有數據者
    universe = [f for f in funds if f["r1m"] is not None and f["r3m"] is not None]
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


def main():
    result = analyze()
    with open(OUT, "w", encoding="utf-8") as fp:
        json.dump(result, fp, ensure_ascii=False, indent=2)
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
