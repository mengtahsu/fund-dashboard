// 模擬基金資料：以種子亂數產生穩定的淨值走勢（每次載入結果一致）。
// 之後若要接真實資料源，只要讓 window.FUNDS 維持相同結構即可，app.js 不必改。

(function () {
  "use strict";

  // mulberry32：輕量、可重現的偽亂數產生器
  function mulberry32(seed) {
    return function () {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // 以隨機漫步產生 days 天的淨值序列，結束於今天
  function genHistory(seed, start, drift, vol, days) {
    const rng = mulberry32(seed);
    const out = [];
    let v = start;
    const today = new Date("2026-06-26T00:00:00");
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const change = (rng() - 0.5) * vol + drift; // 日報酬
      v = Math.max(0.5, v * (1 + change));
      out.push({ date: d.toISOString().slice(0, 10), value: +v.toFixed(2) });
    }
    return out;
  }

  // 基金定義：seed 固定走勢、start 起始淨值、drift 每日趨勢、vol 波動度
  const DEFS = [
    { id: "twg",  name: "台股成長基金",     category: "股票型",   currency: "TWD", seed: 101, start: 24.6, drift: 0.0012,  vol: 0.024 },
    { id: "gtech",name: "全球科技基金",     category: "股票型",   currency: "USD", seed: 202, start: 38.2, drift: 0.0016,  vol: 0.030 },
    { id: "usbond",name:"美國債券基金",     category: "債券型",   currency: "USD", seed: 303, start: 12.1, drift: 0.0003,  vol: 0.006 },
    { id: "em",   name: "新興市場股票基金", category: "股票型",   currency: "USD", seed: 404, start: 18.9, drift: -0.0004, vol: 0.028 },
    { id: "hy",   name: "高收益債基金",     category: "債券型",   currency: "USD", seed: 505, start: 9.7,  drift: 0.0006,  vol: 0.010 },
    { id: "reit", name: "亞洲不動產基金",   category: "不動產",   currency: "USD", seed: 606, start: 15.3, drift: 0.0008,  vol: 0.018 },
    { id: "gold", name: "黃金資源基金",     category: "商品型",   currency: "USD", seed: 707, start: 21.4, drift: 0.0010,  vol: 0.022 },
    { id: "eu",   name: "歐洲價值基金",     category: "股票型",   currency: "EUR", seed: 808, start: 16.8, drift: 0.0005,  vol: 0.020 },
    { id: "bal",  name: "平衡配置基金",     category: "平衡型",   currency: "TWD", seed: 909, start: 13.5, drift: 0.0007,  vol: 0.012 },
    { id: "esg",  name: "ESG永續基金",      category: "股票型",   currency: "USD", seed: 110, start: 20.1, drift: 0.0011,  vol: 0.021 },
  ];

  const DAYS = 90;

  window.FUNDS = DEFS.map((f) => ({
    id: f.id,
    name: f.name,
    category: f.category,
    currency: f.currency,
    history: genHistory(f.seed, f.start, f.drift, f.vol, DAYS),
  }));

  window.DATA_UPDATED = "2026-06-26";
})();
