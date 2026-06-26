"""MoneyDJ 基金績效爬蟲（純標準庫，無需 pip 套件）。

抓取設定的基金分類排行頁（Big5 編碼），解析出每檔基金的近 1 月 / 3 月 報酬，
並抓取台股加權指數 (TAIEX) 同期報酬作為「大盤基準」。

資料來源：
- 基金：https://www.moneydj.com/funddj/ya/yp401000.djhtm?A=...&B=...
- 大盤：TWSE 官方加權指數日資料 API
"""

import json
import re
import html as ihtml
import urllib.request
import urllib.error
from datetime import date, timedelta

UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"}

# MoneyDJ 國內基金分類代碼（A=ET00X00Y）。實測對應如下。
# 每筆：(代碼, 子分類名, 大類, 是否納入選股池)
#   pick=True 者用於「今日選基金」（國內股票 + 國內平衡，與 TAIEX 比較才公平）；
#   其餘僅用於首頁行情看板的廣度。
RANK_URL = "https://www.moneydj.com/funddj/ya/yp401000.djhtm?A={code}&B=806"
CATEGORIES = [
    # 國內股票型 ET001*
    ("ET001001", "科技類",   "國內股票", True),
    ("ET001004", "中小型",   "國內股票", True),
    ("ET001005", "一般股票", "國內股票", True),
    ("ET001006", "中國大陸", "國內股票", True),
    ("ET001007", "高股息",   "國內股票", True),
    ("ET001008", "上櫃店頭", "國內股票", True),
    ("ET001010", "主動式ETF", "國內股票", True),
    # 平衡型 ET004*
    ("ET004001", "國內平衡", "平衡型",   True),
    ("ET004002", "平衡王",   "平衡型",   True),
    # 跨區平衡與多重資產屬跨國/全球，與「台股抄底」情境不符，僅供看板廣度，不納入選股池
    ("ET004003", "跨區平衡", "跨區平衡", False),
    ("ET004005", "多重資產", "多重資產", False),
]


def _fetch(url, encoding="big5"):
    req = urllib.request.Request(url, headers=UA)
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=25) as r:
                return r.read().decode(encoding, "ignore")
        except (urllib.error.URLError, TimeoutError):
            if attempt == 2:
                raise
    return ""


def _num(s):
    """'9.39' -> 9.39；'1,234.5' -> 1234.5；'N/A'/'' -> None。"""
    s = s.replace(",", "").strip()
    if not s or s.upper() == "N/A":
        return None
    try:
        return float(s)
    except ValueError:
        return None


def _g(tds, i):
    return _num(tds[i]) if len(tds) > i else None


def fetch_category(code, subcat, group, pick):
    """回傳該分類的基金清單。"""
    html = _fetch(RANK_URL.format(code=code))
    funds = []
    for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", html, re.I | re.S):
        if "yp010000.djhtm" not in tr:
            continue
        code_m = re.search(r"yp010000\.djhtm\?a=([A-Za-z0-9]+)", tr, re.I)
        tds = [
            ihtml.unescape(re.sub(r"<[^>]+>", "", c)).strip()
            for c in re.findall(r"<td[^>]*>(.*?)</td>", tr, re.I | re.S)
        ]
        # 欄位：排名,基金名稱,基金公司,淨值日期,一個月,三個月,六個月,一年,三年,五年
        if len(tds) < 6 or not code_m:
            continue
        funds.append({
            "code": code_m.group(1),
            "name": tds[1],
            "company": tds[2],
            "nav_date": tds[3],
            "r1m": _g(tds, 4),
            "r3m": _g(tds, 5),
            "r6m": _g(tds, 6),
            "r1y": _g(tds, 7),
            "r3y": _g(tds, 8),
            "r5y": _g(tds, 9),
            "category": subcat,
            "group": group,
            "pick": pick,
        })
    return funds


def fetch_funds():
    """抓所有設定分類，依基金代碼去重（先出現者優先）。"""
    seen, out = set(), []
    for code, subcat, group, pick in CATEGORIES:
        try:
            cat_funds = fetch_category(code, subcat, group, pick)
            added = 0
            for f in cat_funds:
                if f["code"] in seen:
                    continue
                seen.add(f["code"])
                out.append(f)
                added += 1
            print(f"  {code} {group}/{subcat}: {added} 檔")
        except Exception as e:  # 單一分類失敗不影響其他
            print(f"[warn] 分類 {code} 抓取失敗: {e}")
    return out


def _twii_series():
    """台股加權指數 (^TWII) 近 6 個月日收盤：[(iso_date, close), ...]。

    主來源 Yahoo Finance；失敗時退回 TWSE OpenAPI（僅當月，只夠算近 1 月）。
    """
    # 主來源：Yahoo Finance
    try:
        raw = _fetch(
            "https://query1.finance.yahoo.com/v8/finance/chart/%5ETWII"
            "?range=6mo&interval=1d",
            encoding="utf-8",
        )
        r = json.loads(raw)["chart"]["result"][0]
        ts = r["timestamp"]
        cl = r["indicators"]["quote"][0]["close"]
        pts = [
            (date.fromtimestamp(t).isoformat(), c)
            for t, c in zip(ts, cl)
            if c is not None
        ]
        if pts:
            return pts
    except Exception as e:
        print(f"[warn] Yahoo ^TWII 抓取失敗，改用 TWSE: {e}")

    # 備援：TWSE OpenAPI（僅當月）
    try:
        raw = _fetch(
            "https://openapi.twse.com.tw/v1/exchangeReport/MI_5MINS_HIST",
            encoding="utf-8",
        )
        out = []
        for row in json.loads(raw):
            d = row["Date"]  # 民國 yyyymmdd，如 1150601
            iso = f"{int(d[:3]) + 1911:04d}-{d[3:5]}-{d[5:7]}"
            out.append((iso, _num(row["ClosingIndex"])))
        return [(d, c) for d, c in out if c]
    except Exception as e:
        print(f"[warn] TWSE OpenAPI 也失敗: {e}")
        return []


def fetch_benchmark():
    """台股加權指數近 1 月 / 3 月報酬 (%)。"""
    series = sorted(_twii_series())
    if not series:
        return {"r1m": None, "r3m": None, "as_of": None}
    last_d, last_c = series[-1]

    def ret_since(days):
        target = date.fromisoformat(last_d) - timedelta(days=days)
        prior = [(d, c) for d, c in series if date.fromisoformat(d) <= target and c]
        if not prior or not last_c:
            return None
        return round((last_c / prior[-1][1] - 1) * 100, 2)

    return {"r1m": ret_since(30), "r3m": ret_since(91), "as_of": last_d}


if __name__ == "__main__":
    funds = fetch_funds()
    bench = fetch_benchmark()
    print(f"基金 {len(funds)} 檔；大盤近1月 {bench['r1m']}% 近3月 {bench['r3m']}%")
    for f in funds[:5]:
        print(f)
