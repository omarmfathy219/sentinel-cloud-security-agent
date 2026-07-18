(function () {
  "use strict";
  const D = window.SENTINEL_DATA;
  const SEV = ["critical", "high", "medium", "low"];
  const SEV_COLOR = { critical: "#d03b3b", high: "#ec835a", medium: "#fab219", low: "#2a78d6" };
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.prototype.slice.call(r.querySelectorAll(s));
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const fmtTime = (iso) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  const fmtDate = (iso) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

  // ---- Tabs ----
  const TABS = ["overview", "findings", "runs", "intel"];
  function activateTab(name) {
    $$(".tab").forEach((x) => x.classList.toggle("is-active", x.dataset.tab === name));
    $$(".panel").forEach((p) => p.classList.toggle("is-active", p.dataset.panel === name));
    if (name === "intel") loadIntel();
  }
  $$(".tab").forEach((t) => t.addEventListener("click", () => {
    activateTab(t.dataset.tab);
    history.replaceState(null, "", "#" + t.dataset.tab);
  }));

  // ---- Overview: stat tiles ----
  function renderStats() {
    const s = D.stats;
    const tiles = [
      { label: "Open issues", value: s.openIssues, meta: D.severityBreakdown.critical + " critical", cls: s.openIssues ? "accent-critical" : "" },
      { label: "Agent runs", value: s.totalRuns, meta: "scheduled daily" },
      { label: "Schedule success", value: s.successRate + "%", meta: "✓ latest run OK", good: true },
      { label: "Issues detected (30d)", value: s.totalIssuesDetected, meta: "~" + s.avgPerRun + " per run" },
      { label: "Last scan", value: D.severityBreakdown.critical + D.severityBreakdown.high, meta: "high+critical", },
    ];
    $("#stat-row").innerHTML = tiles.map((t) => `
      <div class="stat ${t.cls || ""}">
        <div class="label">${esc(t.label)}</div>
        <div class="value tabular">${esc(t.value)}</div>
        <div class="meta ${t.good ? "good" : ""}">${esc(t.meta)}</div>
      </div>`).join("");
  }

  // ---- Overview: trend area chart (single series, blue) with hover ----
  function renderTrend() {
    const data = D.trend;
    const W = 620, H = 200, P = { t: 12, r: 12, b: 24, l: 30 };
    const iw = W - P.l - P.r, ih = H - P.t - P.b;
    const max = Math.max.apply(null, data.map((d) => d.issues)) * 1.15;
    const x = (i) => P.l + (i / (data.length - 1)) * iw;
    const y = (v) => P.t + ih - (v / max) * ih;
    const line = data.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d.issues).toFixed(1)}`).join(" ");
    const area = `${line} L${x(data.length - 1).toFixed(1)},${(P.t + ih).toFixed(1)} L${x(0).toFixed(1)},${(P.t + ih).toFixed(1)} Z`;
    const ticks = [0, Math.round(max / 2), Math.round(max * 0.85)];
    const grid = ticks.map((v) => `<line x1="${P.l}" x2="${W - P.r}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="#e1e0d9"/><text x="${P.l - 6}" y="${(y(v) + 3).toFixed(1)}" text-anchor="end" fill="#898781" font-size="10">${v}</text>`).join("");
    const xlabels = [0, 9, 19, 29].map((i) => `<text x="${x(i).toFixed(1)}" y="${H - 6}" text-anchor="middle" fill="#898781" font-size="10">${fmtDate(data[i].date)}</text>`).join("");
    $("#chart-trend").innerHTML = `
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Issues detected per day over the last 30 scans">
        ${grid}
        <path d="${area}" fill="#eaf2fc"/>
        <path d="${line}" fill="none" stroke="#2a78d6" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
        ${xlabels}
        <line id="tr-cross" y1="${P.t}" y2="${P.t + ih}" stroke="#c3c2b7" stroke-dasharray="3 3" style="opacity:0"/>
        <circle id="tr-dot" r="4" fill="#2a78d6" stroke="#fff" stroke-width="2" style="opacity:0"/>
        <rect x="${P.l}" y="${P.t}" width="${iw}" height="${ih}" fill="transparent" id="tr-hit"/>
      </svg>`;
    const svg = $("#chart-trend svg"), hit = $("#tr-hit"), cross = $("#tr-cross"), dot = $("#tr-dot");
    hit.addEventListener("mousemove", (e) => {
      const r = svg.getBoundingClientRect();
      const sx = (e.clientX - r.left) / r.width * W;
      let i = Math.round((sx - P.l) / iw * (data.length - 1));
      i = Math.max(0, Math.min(data.length - 1, i));
      cross.setAttribute("x1", x(i)); cross.setAttribute("x2", x(i)); cross.style.opacity = 1;
      dot.setAttribute("cx", x(i)); dot.setAttribute("cy", y(data[i].issues)); dot.style.opacity = 1;
      showTip(e, `${fmtDate(data[i].date)} · <b>${data[i].issues}</b> issues`);
    });
    hit.addEventListener("mouseleave", () => { cross.style.opacity = 0; dot.style.opacity = 0; hideTip(); });
  }

  // ---- Horizontal bars (severity uses status colors + labels; category one hue) ----
  function bars(el, entries, colorFn) {
    const max = Math.max.apply(null, entries.map((e) => e.v)) || 1;
    el.innerHTML = entries.map((e) => `
      <div class="barrow">
        <div class="k">${esc(e.k)}</div>
        <div class="track"><div class="fill" style="width:${(e.v / max * 100).toFixed(1)}%;background:${colorFn(e)}"></div></div>
        <div class="v">${e.v}</div>
      </div>`).join("");
  }
  function renderSeverity() {
    bars($("#chart-severity"), SEV.map((s) => ({ k: cap(s), v: D.severityBreakdown[s], sev: s })), (e) => SEV_COLOR[e.sev]);
  }
  function renderCategory() {
    const entries = Object.keys(D.categoryBreakdown).map((k) => ({ k, v: D.categoryBreakdown[k] })).sort((a, b) => b.v - a.v);
    bars($("#chart-category"), entries, () => "#2a78d6");
  }

  function renderLastRun() {
    const r = D.stats.lastRun;
    $("#lastrun-card").innerHTML = `
      <div class="card-head"><h2>Most recent run</h2></div>
      <div class="lastrun">
        <div class="row"><span class="k">When</span><span>${esc(fmtTime(r.at))}</span></div>
        <div class="row"><span class="k">Status</span><span class="pill good">✓ Success</span></div>
        <div class="row"><span class="k">Findings</span><span>${r.findings}</span></div>
        <div class="row"><span class="k">Duration</span><span>${(r.durationMs / 1000).toFixed(1)}s</span></div>
        <div class="row"><span class="k">Trigger</span><span>EventBridge Scheduler</span></div>
      </div>`;
  }

  // ---- Findings with filters ----
  let activeSev = "all", activeCat = "", searchQ = "";
  function renderSevFilters() {
    const opts = ["all"].concat(SEV);
    $("#sev-filters").innerHTML = opts.map((s) => `<button class="chip ${s === activeSev ? "is-active" : ""}" data-sev="${s}">${s === "all" ? "All" : cap(s)}</button>`).join("");
    $$("#sev-filters .chip").forEach((c) => c.addEventListener("click", () => { activeSev = c.dataset.sev; renderSevFilters(); renderFindings(); }));
  }
  function renderCatFilter() {
    const cats = Object.keys(D.categoryBreakdown);
    $("#cat-filter").innerHTML = '<option value="">All categories</option>' + cats.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join("");
    $("#cat-filter").addEventListener("change", (e) => { activeCat = e.target.value; renderFindings(); });
    $("#search").addEventListener("input", (e) => { searchQ = e.target.value.toLowerCase(); renderFindings(); });
  }
  function renderFindings() {
    const list = D.findings.filter((f) =>
      (activeSev === "all" || f.severity === activeSev) &&
      (!activeCat || f.category === activeCat) &&
      (!searchQ || (f.title + f.resource + f.detail).toLowerCase().includes(searchQ))
    );
    $("#findings-empty").hidden = list.length > 0;
    $("#findings-list").innerHTML = list.map((f) => `
      <div class="finding sev-${f.severity}">
        <div class="finding-top">
          <span class="sev-tag sev-${f.severity}">${f.severity.toUpperCase()}</span>
          <span class="cat-tag">${esc(f.category)}</span>
        </div>
        <h3>${esc(f.title)}</h3>
        <div class="detail">${esc(f.detail)}</div>
        <div class="res">Resource: <code>${esc(f.resource)}</code></div>
        <pre>${esc(f.manualFix)}</pre>
        ${f.fixable ? '<div class="fixable">✓ One-click "Apply fix" available in the private email brief</div>' : ""}
      </div>`).join("");
  }

  // ---- Agent runs table ----
  function renderRuns() {
    $("#runs-table tbody").innerHTML = D.runs.map((r) => `
      <tr>
        <td class="strong">${esc(fmtTime(r.at))}</td>
        <td><span class="pill good">✓ Success</span></td>
        <td>${r.findings}</td>
        <td>${(r.durationMs / 1000).toFixed(1)}s</td>
      </tr>`).join("");
  }

  // ---- Threat intel (live CISA KEV feed, fallback to bundled real CVEs) ----
  let intelLoaded = false;
  function loadIntel() {
    if (intelLoaded) return;
    intelLoaded = true;
    const KEV = "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json";
    fetch(KEV, { mode: "cors" })
      .then((r) => { if (!r.ok) throw new Error("bad status"); return r.json(); })
      .then((j) => {
        const items = (j.vulnerabilities || [])
          .slice()
          .sort((a, b) => (b.dateAdded || "").localeCompare(a.dateAdded || ""))
          .slice(0, 12)
          .map((v) => ({
            id: v.cveID, badge: "Exploited", title: v.vulnerabilityName || v.cveID,
            summary: v.shortDescription || "", published: v.dateAdded,
            source: [v.vendorProject, v.product].filter(Boolean).join(" "),
            url: "https://nvd.nist.gov/vuln/detail/" + v.cveID,
          }));
        renderIntel(items, "CISA Known Exploited Vulnerabilities · live feed");
      })
      .catch(() => renderIntel(D.cvesFallback, "Notable CVEs · offline sample (live feed unreachable)"));
  }
  function renderIntel(items, source) {
    $("#intel-source").textContent = source;
    $("#intel-list").innerHTML = items.map((c) => {
      const b = (c.badge || "").toLowerCase();
      return `
      <div class="intel">
        <span class="badge b-${esc(b)}">${esc(c.badge)}</span>
        <div class="body">
          <h3><a href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.title)}</a></h3>
          <div class="sum">${esc(c.summary)}</div>
          <div class="m"><span class="cve">${esc(c.id)}</span> · ${esc(c.source || "")} · ${esc(c.published || "")}</div>
        </div>
      </div>`;
    }).join("");
  }

  // ---- Tooltip ----
  let tipEl;
  function showTip(e, html) {
    if (!tipEl) { tipEl = document.createElement("div"); tipEl.className = "tip"; document.body.appendChild(tipEl); }
    tipEl.innerHTML = html;
    tipEl.style.left = (e.clientX + 12) + "px";
    tipEl.style.top = (e.clientY - 30) + "px";
    tipEl.style.opacity = 1;
  }
  function hideTip() { if (tipEl) tipEl.style.opacity = 0; }

  // ---- Boot ----
  renderStats();
  renderTrend();
  renderSeverity();
  renderCategory();
  renderLastRun();
  renderSevFilters();
  renderCatFilter();
  renderFindings();
  renderRuns();

  const initialTab = (location.hash || "").replace("#", "");
  if (TABS.indexOf(initialTab) >= 0) activateTab(initialTab);
})();
