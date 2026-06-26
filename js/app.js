// 基金行情看板：載入真實資料 funds.json（由 analysis 管線每日產生），
// 顯示各期報酬、依群組篩選、並用「績效指數曲線」畫真實走勢。
(function () {
  "use strict";

  let funds = [];
  let activeGroup = "全部";
  let sortKey = "r3m";
  let sortDir = -1; // -1 由大到小
  let selectedCode = null;
  let searchText = "";
  let chart = null;

  const $ = (s) => document.querySelector(s);
  const fmtPct = (v) => (v == null ? "—" : (v >= 0 ? "+" : "") + Number(v).toFixed(2) + "%");
  const cls = (v) => (v == null ? "" : v >= 0 ? "up" : "down");

  fetch("funds.json?_=" + Date.now())
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((d) => {
      funds = d.funds || [];
      $("#fund-count").textContent = d.count != null ? d.count : funds.length;
      $("#updated-date").textContent = d.generated_at || "—";
      selectedCode = funds.length ? funds[0].code : null;
      init();
    })
    .catch(() => {
      $("#fund-count").textContent = "0";
      $("#fund-tbody").innerHTML =
        '<tr><td colspan="5" style="padding:24px;color:var(--muted)">尚無資料（funds.json 未產生）。請先在 GitHub Actions 觸發一次分析。</td></tr>';
    });

  function visible() {
    return funds.filter((f) => {
      if (activeGroup !== "全部" && f.group !== activeGroup) return false;
      if (searchText && !f.name.includes(searchText)) return false;
      return true;
    });
  }

  function renderKpis() {
    const withR1m = funds.filter((f) => f.r1m != null);
    const up = withR1m.filter((f) => f.r1m > 0).length;
    const down = withR1m.filter((f) => f.r1m < 0).length;
    const avg = withR1m.reduce((s, f) => s + f.r1m, 0) / (withR1m.length || 1);
    const cards = [
      { label: "基金檔數", value: funds.length, k: "" },
      { label: "今日平均近1月", value: fmtPct(avg), k: cls(avg) },
      { label: "近1月上漲", value: up + " 檔", k: "up" },
      { label: "近1月下跌", value: down + " 檔", k: "down" },
    ];
    $("#kpis").innerHTML = cards
      .map((c) => `<div class="kpi"><div class="label">${c.label}</div><div class="value ${c.k}">${c.value}</div></div>`)
      .join("");
  }

  function renderChips() {
    const groups = ["全部", ...Array.from(new Set(funds.map((f) => f.group)))];
    $("#category-chips").innerHTML = groups
      .map((g) => `<div class="chip ${g === activeGroup ? "active" : ""}" data-g="${g}">${g}</div>`)
      .join("");
  }

  function cmp(a, b) {
    const av = a[sortKey], bv = b[sortKey];
    if (sortKey === "name" || sortKey === "category") {
      return av < bv ? sortDir : av > bv ? -sortDir : 0;
    }
    // 數字：null 永遠墊底
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    return (av - bv) * sortDir;
  }

  function renderTable() {
    const rows = visible().slice().sort(cmp);
    $("#fund-tbody").innerHTML = rows
      .map((f) => `
        <tr data-code="${f.code}" class="${f.code === selectedCode ? "selected" : ""}">
          <td>${f.name}</td>
          <td class="col-hide-sm"><span class="cat-tag">${f.category}</span></td>
          <td class="num ${cls(f.r1m)}">${fmtPct(f.r1m)}</td>
          <td class="num ${cls(f.r3m)}">${fmtPct(f.r3m)}</td>
          <td class="num ${cls(f.r1y)}">${fmtPct(f.r1y)}</td>
        </tr>`)
      .join("") || '<tr><td colspan="5" style="padding:20px;color:var(--muted)">查無符合基金</td></tr>';
  }

  function renderDetail() {
    const f = funds.find((x) => x.code === selectedCode);
    if (!f) return;
    $("#detail-name").textContent = f.name;
    $("#detail-meta").textContent = `${f.group} · ${f.category} · ${f.company}`;

    const stats = [
      { label: "近1月", v: f.r1m },
      { label: "近3月", v: f.r3m },
      { label: "近1年", v: f.r1y },
    ];
    $("#detail-stats").innerHTML = stats
      .map((s) => `<div class="stat"><div class="label">${s.label}</div><div class="value ${cls(s.v)}">${fmtPct(s.v)}</div></div>`)
      .join("");

    drawChart(f.perf || [], (f.r3m == null ? 0 : f.r3m) >= 0);
  }

  function drawChart(series, isUp) {
    const ctx = document.getElementById("nav-chart").getContext("2d");
    const color = isUp ? "#ff5a5a" : "#1fbf75";
    const grad = ctx.createLinearGradient(0, 0, 0, 300);
    grad.addColorStop(0, isUp ? "rgba(255,90,90,0.25)" : "rgba(31,191,117,0.25)");
    grad.addColorStop(1, "rgba(0,0,0,0)");

    const data = {
      labels: series.map((p) => p.label),
      datasets: [{
        data: series.map((p) => p.value),
        borderColor: color, backgroundColor: grad,
        borderWidth: 2, pointRadius: 3, tension: 0.25, fill: true,
      }],
    };
    const options = {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { mode: "index", intersect: false } },
      scales: {
        x: { ticks: { color: "#8b97a8" }, grid: { display: false } },
        y: { ticks: { color: "#8b97a8" }, grid: { color: "rgba(40,49,66,0.6)" } },
      },
    };
    if (chart) { chart.data = data; chart.options = options; chart.update(); }
    else chart = new Chart(ctx, { type: "line", data, options });
  }

  function bind() {
    $("#category-chips").addEventListener("click", (e) => {
      const c = e.target.closest(".chip");
      if (!c) return;
      activeGroup = c.dataset.g;
      renderChips(); renderTable();
    });
    $("#fund-tbody").addEventListener("click", (e) => {
      const tr = e.target.closest("tr");
      if (!tr || !tr.dataset.code) return;
      selectedCode = tr.dataset.code;
      renderTable(); renderDetail();
    });
    document.querySelectorAll("#fund-table th").forEach((th) => {
      th.addEventListener("click", () => {
        const k = th.dataset.sort;
        if (sortKey === k) sortDir *= -1;
        else { sortKey = k; sortDir = (k === "name" || k === "category") ? 1 : -1; }
        renderTable();
      });
    });
    $("#search").addEventListener("input", (e) => {
      searchText = e.target.value.trim();
      renderTable();
    });
  }

  function init() {
    renderKpis(); renderChips(); renderTable(); renderDetail(); bind();
  }
})();
