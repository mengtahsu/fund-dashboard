// 基金行情看板：純前端邏輯，從 window.FUNDS 計算指標、渲染表格與走勢圖。
(function () {
  "use strict";

  const funds = window.FUNDS || [];

  // ---- 指標計算 ----
  function pct(curr, prev) {
    if (!prev) return 0;
    return ((curr - prev) / prev) * 100;
  }
  // 回傳某檔基金的衍生指標
  function metrics(f) {
    const h = f.history;
    const last = h[h.length - 1].value;
    const prev = h[h.length - 2].value;
    const monthAgo = h[Math.max(0, h.length - 23)].value; // ~22 交易日
    return {
      nav: last,
      day: pct(last, prev),
      month: pct(last, monthAgo),
    };
  }

  const enriched = funds.map((f) => ({ ...f, m: metrics(f) }));

  // ---- 狀態 ----
  let activeCategory = "全部";
  let sortKey = "month";
  let sortDir = -1; // -1 由大到小
  let selectedId = enriched.length ? enriched[0].id : null;
  let searchText = "";
  let range = 22;
  let chart = null;

  // ---- 工具 ----
  const fmtPct = (v) => (v >= 0 ? "+" : "") + v.toFixed(2) + "%";
  const cls = (v) => (v >= 0 ? "up" : "down");
  const $ = (sel) => document.querySelector(sel);

  function visibleFunds() {
    return enriched.filter((f) => {
      if (activeCategory !== "全部" && f.category !== activeCategory) return false;
      if (searchText && !f.name.includes(searchText)) return false;
      return true;
    });
  }

  // ---- KPI ----
  function renderKpis() {
    const all = enriched;
    const up = all.filter((f) => f.m.day > 0).length;
    const down = all.filter((f) => f.m.day < 0).length;
    const avg = all.reduce((s, f) => s + f.m.day, 0) / (all.length || 1);
    const cards = [
      { label: "基金檔數", value: all.length, klass: "" },
      { label: "今日平均漲跌", value: fmtPct(avg), klass: cls(avg) },
      { label: "今日上漲", value: up + " 檔", klass: "up" },
      { label: "今日下跌", value: down + " 檔", klass: "down" },
    ];
    $("#kpis").innerHTML = cards
      .map(
        (c) =>
          `<div class="kpi"><div class="label">${c.label}</div><div class="value ${c.klass}">${c.value}</div></div>`
      )
      .join("");
  }

  // ---- 類別篩選 ----
  function renderChips() {
    const cats = ["全部", ...Array.from(new Set(enriched.map((f) => f.category)))];
    $("#category-chips").innerHTML = cats
      .map(
        (c) =>
          `<div class="chip ${c === activeCategory ? "active" : ""}" data-cat="${c}">${c}</div>`
      )
      .join("");
  }

  // ---- 表格 ----
  function renderTable() {
    const rows = visibleFunds().slice().sort((a, b) => {
      let av, bv;
      if (sortKey === "name" || sortKey === "category") {
        av = a[sortKey];
        bv = b[sortKey];
        return av < bv ? sortDir : av > bv ? -sortDir : 0;
      }
      av = sortKey === "nav" ? a.m.nav : a.m[sortKey];
      bv = sortKey === "nav" ? b.m.nav : b.m[sortKey];
      return (av - bv) * sortDir;
    });

    $("#fund-tbody").innerHTML = rows
      .map(
        (f) => `
      <tr data-id="${f.id}" class="${f.id === selectedId ? "selected" : ""}">
        <td>${f.name}</td>
        <td><span class="cat-tag">${f.category}</span></td>
        <td class="num">${f.m.nav.toFixed(2)}</td>
        <td class="num ${cls(f.m.day)}">${fmtPct(f.m.day)}</td>
        <td class="num ${cls(f.m.month)}">${fmtPct(f.m.month)}</td>
      </tr>`
      )
      .join("");
  }

  // ---- 明細與走勢圖 ----
  function renderDetail() {
    const f = enriched.find((x) => x.id === selectedId);
    if (!f) return;
    $("#detail-name").textContent = f.name;
    $("#detail-meta").textContent = `${f.category} · ${f.currency} · 淨值幣別`;

    const h = f.history;
    const slice = range > 0 ? h.slice(Math.max(0, h.length - range - 1)) : h;
    const first = slice[0].value;
    const last = slice[slice.length - 1].value;
    const rangePct = pct(last, first);
    const hi = Math.max(...slice.map((p) => p.value));
    const lo = Math.min(...slice.map((p) => p.value));

    const stats = [
      { label: "最新淨值", value: last.toFixed(2), klass: "" },
      { label: "區間漲跌", value: fmtPct(rangePct), klass: cls(rangePct) },
      { label: "區間高/低", value: `${hi.toFixed(2)} / ${lo.toFixed(2)}`, klass: "" },
    ];
    $("#detail-stats").innerHTML = stats
      .map(
        (s) =>
          `<div class="stat"><div class="label">${s.label}</div><div class="value ${s.klass}">${s.value}</div></div>`
      )
      .join("");

    drawChart(slice, rangePct >= 0);
  }

  function drawChart(series, isUp) {
    const ctx = document.getElementById("nav-chart").getContext("2d");
    const color = isUp ? "#ff5a5a" : "#1fbf75";
    const grad = ctx.createLinearGradient(0, 0, 0, 300);
    grad.addColorStop(0, isUp ? "rgba(255,90,90,0.25)" : "rgba(31,191,117,0.25)");
    grad.addColorStop(1, "rgba(0,0,0,0)");

    const data = {
      labels: series.map((p) => p.date),
      datasets: [
        {
          data: series.map((p) => p.value),
          borderColor: color,
          backgroundColor: grad,
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.25,
          fill: true,
        },
      ],
    };
    const options = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { mode: "index", intersect: false } },
      scales: {
        x: { ticks: { color: "#8b97a8", maxTicksLimit: 6 }, grid: { display: false } },
        y: { ticks: { color: "#8b97a8" }, grid: { color: "rgba(40,49,66,0.6)" } },
      },
    };
    if (chart) {
      chart.data = data;
      chart.options = options;
      chart.update();
    } else {
      chart = new Chart(ctx, { type: "line", data, options });
    }
  }

  // ---- 事件 ----
  function bind() {
    $("#category-chips").addEventListener("click", (e) => {
      const chip = e.target.closest(".chip");
      if (!chip) return;
      activeCategory = chip.dataset.cat;
      renderChips();
      renderTable();
    });

    $("#fund-tbody").addEventListener("click", (e) => {
      const tr = e.target.closest("tr");
      if (!tr) return;
      selectedId = tr.dataset.id;
      renderTable();
      renderDetail();
    });

    document.querySelectorAll("#fund-table th").forEach((th) => {
      th.addEventListener("click", () => {
        const key = th.dataset.sort;
        if (sortKey === key) sortDir *= -1;
        else {
          sortKey = key;
          sortDir = key === "name" || key === "category" ? 1 : -1;
        }
        renderTable();
      });
    });

    $("#period-toggle").addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;
      range = parseInt(btn.dataset.range, 10);
      document.querySelectorAll("#period-toggle button").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      renderDetail();
    });

    $("#search").addEventListener("input", (e) => {
      searchText = e.target.value.trim();
      renderTable();
    });
  }

  // ---- 初始化 ----
  function init() {
    if (!funds.length) {
      document.body.insertAdjacentHTML("beforeend", "<p style='padding:24px'>無基金資料</p>");
      return;
    }
    $("#updated-date").textContent = window.DATA_UPDATED || "—";
    renderKpis();
    renderChips();
    renderTable();
    renderDetail();
    bind();
  }

  init();
})();
