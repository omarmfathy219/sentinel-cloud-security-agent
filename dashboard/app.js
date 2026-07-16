(function () {
  "use strict";

  var API = (window.SENTINEL_CONFIG && window.SENTINEL_CONFIG.apiBaseUrl || "").replace(/\/$/, "");
  var TOKEN_KEY = "sentinel_token";
  var SEV = ["critical", "high", "medium", "low"];

  var el = {
    gate: document.getElementById("gate"),
    app: document.getElementById("app"),
    loading: document.getElementById("loading"),
    signout: document.getElementById("signout"),
    tokenInput: document.getElementById("token"),
    unlock: document.getElementById("unlock"),
    gateError: document.getElementById("gate-error"),
    meta: document.getElementById("meta"),
    counts: document.getElementById("counts"),
    summary: document.getElementById("summary"),
    findings: document.getElementById("findings"),
    history: document.getElementById("history"),
  };

  function token() { return localStorage.getItem(TOKEN_KEY) || ""; }
  function show(node, on) { node.hidden = !on; }

  async function api(path) {
    var res = await fetch(API + path, {
      headers: { Authorization: "Bearer " + token() },
    });
    if (res.status === 401) { throw { unauthorized: true }; }
    if (!res.ok) { throw new Error("Request failed: " + res.status); }
    return res.json();
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function renderCounts(counts) {
    counts = counts || {};
    el.counts.innerHTML = SEV.map(function (s) {
      var n = counts[s] || 0;
      return '<div class="count ' + s + '"><div class="n">' + n + '</div><div class="l">' + s + "</div></div>";
    }).join("");
  }

  function renderFindings(findings) {
    if (!findings || !findings.length) {
      el.findings.innerHTML = '<div class="card empty">All clear — nothing to action.</div>';
      return;
    }
    el.findings.innerHTML = findings.map(function (f) {
      var apply = f.applyUrl
        ? '<a class="apply" href="' + esc(f.applyUrl) + '" target="_blank" rel="noopener">Review &amp; apply fix →</a>' +
          (f.remediation ? '<span class="effect">' + esc(f.remediation.effect) + "</span>" : "")
        : "";
      return (
        '<div class="finding ' + esc(f.severity) + '">' +
        '<div class="sev">' + esc(String(f.severity).toUpperCase()) + "</div>" +
        "<h3>" + esc(f.title) + "</h3>" +
        '<div class="detail">' + esc(f.detail) + "</div>" +
        '<div class="res">Resource: <code>' + esc(f.resource) + "</code></div>" +
        "<pre><code>" + esc(f.manualFix) + "</code></pre>" +
        apply +
        "</div>"
      );
    }).join("");
  }

  function renderBrief(rec) {
    if (!rec || rec.empty) {
      el.meta.innerHTML = "No scans yet — the agent runs on schedule, or invoke it manually to populate this.";
      el.counts.innerHTML = "";
      el.summary.innerHTML = "";
      el.findings.innerHTML = "";
      return;
    }
    var when = new Date(rec.scannedAt);
    el.meta.innerHTML =
      "Account <strong>" + esc(rec.accountId) + "</strong> · region <strong>" + esc(rec.region) +
      "</strong> · scanned <strong>" + esc(when.toLocaleString()) + "</strong>";
    renderCounts(rec.counts);
    // summaryHtml is model output constrained to <p>/<strong>/<em>; findings text is escaped.
    el.summary.innerHTML = rec.summaryHtml || "";
    renderFindings(rec.findings);
  }

  async function loadHistory() {
    try {
      var data = await api("/briefs");
      var items = (data && data.history) || [];
      el.history.innerHTML =
        "<h2>Recent scans</h2><ul>" +
        items.map(function (h, i) {
          return '<li data-key="' + esc(h.key) + '"' + (i === 0 ? ' class="active"' : "") + ">" +
            esc(new Date(h.scannedAt).toLocaleString()) + "</li>";
        }).join("") + "</ul>";
      Array.prototype.forEach.call(el.history.querySelectorAll("li"), function (li) {
        li.addEventListener("click", function () {
          Array.prototype.forEach.call(el.history.querySelectorAll("li"), function (x) { x.classList.remove("active"); });
          li.classList.add("active");
          openHistory(li.getAttribute("data-key"));
        });
      });
    } catch (e) { /* history is best-effort */ }
  }

  async function openHistory(key) {
    try {
      var rec = await api("/briefs/item?key=" + encodeURIComponent(key));
      renderBrief(rec);
    } catch (e) { handleError(e); }
  }

  function handleError(e) {
    if (e && e.unauthorized) { signOut("Token rejected. Try again."); return; }
    el.meta.innerHTML = '<span class="error">' + esc((e && e.message) || "Something went wrong") + "</span>";
  }

  async function loadDashboard() {
    show(el.gate, false); show(el.app, false); show(el.loading, true); show(el.signout, true);
    try {
      var latest = await api("/briefs/latest");
      renderBrief(latest);
      await loadHistory();
      show(el.app, true);
    } catch (e) {
      handleError(e);
      if (!(e && e.unauthorized)) show(el.app, true);
    } finally {
      show(el.loading, false);
    }
  }

  function signOut(msg) {
    localStorage.removeItem(TOKEN_KEY);
    show(el.app, false); show(el.loading, false); show(el.signout, false); show(el.gate, true);
    if (msg) { el.gateError.textContent = msg; show(el.gateError, true); }
  }

  el.unlock.addEventListener("click", function () {
    var t = el.tokenInput.value.trim();
    if (!t) return;
    localStorage.setItem(TOKEN_KEY, t);
    show(el.gateError, false);
    loadDashboard();
  });
  el.tokenInput.addEventListener("keydown", function (e) { if (e.key === "Enter") el.unlock.click(); });
  el.signout.addEventListener("click", function () { signOut(); });

  // Boot
  if (!API) {
    el.loading.textContent = "Dashboard not configured (missing config.js).";
  } else if (token()) {
    loadDashboard();
  } else {
    show(el.loading, false); show(el.gate, true);
  }
})();
