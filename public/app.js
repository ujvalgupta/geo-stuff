// ── DOM refs ──────────────────────────────────────────────
const form         = document.querySelector("#analyze-form");
const urlInput     = document.querySelector("#url-input");
const submitButton = document.querySelector("#submit-button");
const btnText      = submitButton.querySelector(".btn-text");
const btnSpinner   = submitButton.querySelector(".btn-spinner");
const loadingPanel = document.querySelector("#loading-panel");
const loadingStep  = document.querySelector("#loading-step");
const statusPanel  = document.querySelector("#status-panel");
const checksPanel  = document.querySelector("#checks-panel");
const jsonPanel    = document.querySelector("#json-panel");
const resultTitle  = document.querySelector("#result-title");
const resultSummary= document.querySelector("#result-summary");
const scoreValue   = document.querySelector("#score-value");
const scoreBadge   = document.querySelector("#score-badge");
const statRow      = document.querySelector("#stat-row");
const jsonOutput   = document.querySelector("#json-output");
const tmpl         = document.querySelector("#check-card-template");

// ── Chart instances ───────────────────────────────────────
let radarChart = null;
let barChart   = null;

// ── Check → category mapping ──────────────────────────────
const CHECK_META = {
  fetchability:        { label: "Fetchability",     icon: "⚡", grid: "grid-fetchability" },
  robotsTxt:           { label: "Robots.txt",        icon: "🤖", grid: "grid-botaccess" },
  botAccessSimulation: { label: "Bot Simulation",    icon: "🔍", grid: "grid-botaccess" },
  metaRobots:          { label: "Meta Robots",       icon: "🏷️", grid: "grid-crawlsignals" },
  canonical:           { label: "Canonical Tag",     icon: "🔗", grid: "grid-crawlsignals" },
  sitemap:             { label: "Sitemap",           icon: "🗺️", grid: "grid-crawlsignals" },
  structuredData:      { label: "Structured Data",   icon: "📐", grid: "grid-structureddata" },
  javascriptRendering: { label: "JS Rendering",      icon: "🖥️", grid: "grid-rendering" },
  contentExtraction:   { label: "Content Quality",   icon: "📄", grid: "grid-content" },
  openGraph:           { label: "Open Graph",        icon: "🪟", grid: "grid-content" },
  contentFreshness:    { label: "Content Freshness", icon: "🕐", grid: "grid-content" },
};

const BREAKDOWN_META = {
  fetchability:   "Fetchability",
  botAccess:      "Bot Access",
  crawlSignals:   "Crawl Signals",
  structuredData: "Structured Data",
  rendering:      "Rendering",
  contentQuality: "Content",
};

const CLASSIFICATION_META = {
  Excellent: { color: "#1a7a45" },
  Good:      { color: "#2a7a7a" },
  Risky:     { color: "#8a6618" },
  Broken:    { color: "#8a2838" },
};

const STATUS_META = {
  PASS:    { icon: "✓", label: "Pass",    cls: "status-pass"    },
  WARNING: { icon: "△", label: "Warn",    cls: "status-warning" },
  FAIL:    { icon: "✕", label: "Fail",    cls: "status-fail"    },
};

// ── Colours ───────────────────────────────────────────────
const ACCENT       = "#3b7a62";
const ACCENT_FILL  = "rgba(59,122,98,0.15)";
const PASS_CLR     = "#1a7a45";
const WARN_CLR     = "#8a6618";
const FAIL_CLR     = "#8a2838";

function scoreColor(pct) {
  return pct >= 70 ? PASS_CLR : pct >= 40 ? WARN_CLR : FAIL_CLR;
}
function statusToScore(status) {
  return status === "PASS" ? 100 : status === "WARNING" ? 50 : 0;
}

// ── Chart defaults ────────────────────────────────────────
Chart.defaults.font.family = "'Inter', system-ui, sans-serif";
Chart.defaults.color       = "#5a7068";

// ── Radar chart ───────────────────────────────────────────
function renderRadar(breakdown) {
  if (radarChart) { radarChart.destroy(); radarChart = null; }
  const labels = Object.keys(breakdown).map(k => BREAKDOWN_META[k] ?? k);
  const data   = Object.values(breakdown).map(v => Math.round(v * 100));

  radarChart = new Chart(document.getElementById("radar-chart"), {
    type: "radar",
    data: {
      labels,
      datasets: [{
        label: "Score",
        data,
        fill: true,
        backgroundColor: ACCENT_FILL,
        borderColor: ACCENT,
        borderWidth: 2,
        pointBackgroundColor: data.map(v => scoreColor(v)),
        pointBorderColor: "#fff",
        pointRadius: 5,
        pointHoverRadius: 7,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      animation: { duration: 700, easing: "easeInOutQuart" },
      scales: {
        r: {
          min: 0, max: 100,
          ticks: { stepSize: 25, display: false },
          grid:        { color: "rgba(0,0,0,0.07)" },
          angleLines:  { color: "rgba(0,0,0,0.07)" },
          pointLabels: { font: { size: 11, weight: "600" }, color: "#1a2a22" },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { label: ctx => ` ${ctx.raw}%` },
          backgroundColor: "#fff",
          titleColor: "#1a2a22",
          bodyColor: "#5a7068",
          borderColor: "rgba(0,0,0,0.08)",
          borderWidth: 1,
          padding: 10,
          cornerRadius: 10,
        },
      },
    },
  });
}

// ── Bar chart ─────────────────────────────────────────────
function renderBar(checks) {
  if (barChart) { barChart.destroy(); barChart = null; }
  const entries = Object.entries(checks);
  const labels  = entries.map(([k]) => CHECK_META[k]?.label ?? k);
  const data    = entries.map(([, v]) => statusToScore(v.status));
  const colors  = data.map(v => scoreColor(v));

  barChart = new Chart(document.getElementById("bar-chart"), {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Score",
        data,
        backgroundColor: colors.map(c => c + "22"),
        borderColor: colors,
        borderWidth: 2,
        borderRadius: 8,
        borderSkipped: false,
      }],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 700, easing: "easeInOutQuart" },
      scales: {
        x: {
          min: 0, max: 100,
          ticks: { callback: v => `${v}%`, font: { size: 11 } },
          grid:  { color: "rgba(0,0,0,0.06)" },
          border: { display: false },
        },
        y: {
          ticks: { font: { size: 11, weight: "600" }, color: "#1a2a22" },
          grid:  { display: false },
          border: { display: false },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { label: ctx => ` ${ctx.raw}%` },
          backgroundColor: "#fff",
          titleColor: "#1a2a22",
          bodyColor: "#5a7068",
          borderColor: "rgba(0,0,0,0.08)",
          borderWidth: 1,
          padding: 10,
          cornerRadius: 10,
        },
      },
    },
  });
}

// ── Stat pills ────────────────────────────────────────────
function renderStats(checks) {
  const counts = { PASS: 0, WARNING: 0, FAIL: 0 };
  Object.values(checks).forEach(v => counts[v.status]++);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  statRow.innerHTML = `
    <div class="stat-pill stat-pill--pass">
      <span class="stat-num">${counts.PASS}</span>
      <span class="stat-lbl">Passed</span>
      <span class="stat-bar"><span style="width:${(counts.PASS/total)*100}%"></span></span>
    </div>
    <div class="stat-pill stat-pill--warn">
      <span class="stat-num">${counts.WARNING}</span>
      <span class="stat-lbl">Warnings</span>
      <span class="stat-bar"><span style="width:${(counts.WARNING/total)*100}%"></span></span>
    </div>
    <div class="stat-pill stat-pill--fail">
      <span class="stat-num">${counts.FAIL}</span>
      <span class="stat-lbl">Failed</span>
      <span class="stat-bar"><span style="width:${(counts.FAIL/total)*100}%"></span></span>
    </div>
    <div class="stat-pill stat-pill--total">
      <span class="stat-num">${total}</span>
      <span class="stat-lbl">Total checks</span>
    </div>
  `;
}

// ── Metadata detail builder ───────────────────────────────
function buildDetailRows(key, metadata) {
  const rows = [];

  function add(label, value) {
    if (value === null || value === undefined || value === "") return;
    rows.push({ label, value: String(value) });
  }
  function addBool(label, value) {
    if (value === null || value === undefined) return;
    rows.push({ label, value: value ? "Yes" : "No", bool: value });
  }
  function addList(label, arr) {
    if (!Array.isArray(arr) || arr.length === 0) return;
    rows.push({ label, value: arr.join(", ") });
  }

  switch (key) {
    case "fetchability":
      add("Final URL", metadata.finalUrl);
      add("Status Code", metadata.statusCode);
      add("Duration", metadata.durationMs != null ? `${metadata.durationMs}ms` : null);
      add("Redirects", metadata.redirectCount != null ? `${metadata.redirectCount} hop${metadata.redirectCount !== 1 ? "s" : ""}` : null);
      addBool("DNS Resolved", metadata.dnsResolved);
      addBool("TLS OK", metadata.tlsChecked ? metadata.tlsOk : null);
      addBool("302 in Chain", metadata.has302InChain || false);
      break;

    case "robotsTxt":
      add("Robots.txt URL", metadata.robotsUrl);
      add("Status Code", metadata.statusCode);
      add("Crawl-delay", metadata.crawlDelay != null ? `${metadata.crawlDelay}s` : "Not set");
      if (Array.isArray(metadata.evaluations)) {
        for (const e of metadata.evaluations) {
          rows.push({ label: e.userAgent, value: e.allowed ? "✓ Allowed" : "✕ Blocked", bool: e.allowed });
        }
      }
      break;

    case "botAccessSimulation":
      add("Bots Checked", metadata.botsChecked);
      addList("Blocked Bots", metadata.blockedBots);
      addList("Divergent Bots", metadata.divergentBots);
      if (Array.isArray(metadata.simulations)) {
        for (const s of metadata.simulations) {
          rows.push({
            label: s.botName,
            value: s.accessible
              ? `✓ ${s.comparisonToBrowser ? `sim: ${s.comparisonToBrowser.similarityScore}` : "accessible"}`
              : `✕ ${s.blocked ? "blocked" : "error"}`,
            bool: s.accessible,
          });
        }
      }
      break;

    case "metaRobots":
      add("Tags Found", metadata.tagsFound);
      addList("Blocking Directives", metadata.blockingDirectivesFound);
      if (Array.isArray(metadata.details)) {
        for (const d of metadata.details) {
          rows.push({ label: d.source, value: d.rawContent });
        }
      }
      break;

    case "canonical":
      add("Canonical URL", metadata.canonicalUrl || "Not found");
      addBool("Self-referencing", metadata.isSelfReferencing);
      break;

    case "sitemap":
      add("Sitemap URL", metadata.sitemapUrl);
      addBool("Sitemap Found", metadata.sitemapFound);
      addBool("URL in Sitemap", metadata.urlInSitemap);
      break;

    case "structuredData":
      add("JSON-LD Blocks", metadata.totalBlocks);
      add("Parse Errors", metadata.parseErrors || 0);
      addList("Schema Types", metadata.schemaTypes);
      addList("Recognized Types", metadata.recognizedTypes);
      addList("Missing Fields", metadata.missingFields);
      addBool("Valid @context", metadata.hasValidContext);
      addBool("Title Mismatch", metadata.titleMismatch === true ? false : null);
      break;

    case "javascriptRendering":
      add("Rendering Mode", metadata.inferredRenderingMode);
      add("Script Tags", metadata.scriptTagCount);
      add("Raw Text Length", metadata.rawTextLength);
      add("Rendered Text Length", metadata.renderedTextLength);
      add("Render Dependency Score", metadata.renderDependencyScore);
      addBool("Playwright Available", metadata.playwrightAvailable);
      break;

    case "contentExtraction":
      add("Extraction Source", metadata.extractionSource);
      add("Word Count", metadata.extractedWordCount);
      add("Title", metadata.title);
      add("Meta Description", metadata.metaDescription);
      add("Text Sample", metadata.textSample);
      break;

    case "openGraph":
      addList("Present", metadata.present);
      addList("Missing", metadata.missing);
      if (metadata.fields) {
        for (const [prop, val] of Object.entries(metadata.fields)) {
          if (val) rows.push({ label: prop, value: String(val) });
        }
      }
      break;

    case "contentFreshness":
      add("Age", metadata.ageInDays != null ? `${metadata.ageInDays} days (${metadata.freshnessLabel})` : null);
      add("Best Signal", metadata.bestSignalSource);
      add("Date Found", metadata.bestSignalDate ? new Date(metadata.bestSignalDate).toLocaleDateString() : null);
      break;

    default:
      for (const [k, v] of Object.entries(metadata)) {
        if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
          add(k, v);
        }
      }
  }

  return rows;
}

// ── Check cards ───────────────────────────────────────────
function renderCheckCard(key, value, gridId) {
  const grid = document.getElementById(gridId);
  if (!grid) return;

  const node = tmpl.content.firstElementChild.cloneNode(true);
  const cm = CHECK_META[key] ?? { label: key, icon: "●" };
  const sm = STATUS_META[value.status] ?? { icon: "?", label: value.status, cls: "" };

  node.querySelector(".check-icon").textContent  = cm.icon;
  node.querySelector(".check-title").textContent = cm.label;

  const pill = node.querySelector(".status-pill");
  pill.innerHTML = `<span class="pill-icon">${sm.icon}</span>${sm.label}`;
  pill.className = `status-pill ${sm.cls}`;

  node.querySelector(".check-reason").textContent = value.reason;

  // Details
  const toggle  = node.querySelector(".details-toggle");
  const body    = node.querySelector(".details-body");
  const dl      = node.querySelector(".details-list");
  const rows    = buildDetailRows(key, value.metadata ?? {});

  if (rows.length === 0) {
    toggle.remove();
  } else {
    for (const row of rows) {
      const dt = document.createElement("dt");
      dt.textContent = row.label;
      const dd = document.createElement("dd");
      dd.textContent = row.value;
      if (row.bool === true)  dd.classList.add("detail-pass");
      if (row.bool === false) dd.classList.add("detail-fail");
      dl.append(dt, dd);
    }

    toggle.addEventListener("click", () => {
      const expanded = toggle.getAttribute("aria-expanded") === "true";
      toggle.setAttribute("aria-expanded", String(!expanded));
      body.hidden = expanded;
      toggle.querySelector(".toggle-chevron").style.transform = expanded ? "" : "rotate(90deg)";
    });
  }

  grid.appendChild(node);
}

// ── Render checks grouped by category ────────────────────
function renderChecks(checks) {
  // Clear all grids
  document.querySelectorAll(".checks-grid").forEach(g => g.replaceChildren());

  for (const [key, value] of Object.entries(checks)) {
    const cm = CHECK_META[key];
    if (cm) renderCheckCard(key, value, cm.grid);
  }
}

// ── Show panels ───────────────────────────────────────────
function showResultPanels() {
  [statusPanel, checksPanel, jsonPanel].forEach(p => {
    p.classList.remove("hidden");
    p.style.animation = "none";
    void p.offsetHeight;
    p.style.animation = "";
  });
}

// ── Loading animation ─────────────────────────────────────
const LOADING_STEPS = [
  "Fetching page…",
  "Checking DNS & TLS…",
  "Simulating 7 AI bot crawlers…",
  "Parsing robots.txt…",
  "Checking meta robots & X-Robots-Tag…",
  "Validating canonical tag…",
  "Checking sitemap…",
  "Extracting JSON-LD schema…",
  "Analyzing JS rendering…",
  "Checking Open Graph & freshness…",
  "Calculating GEO score…",
];
const LC_SEQUENCE = [
  ["lc-fetch"],
  ["lc-fetch"],
  ["lc-bots"],
  ["lc-bots"],
  ["lc-crawl"],
  ["lc-crawl"],
  ["lc-crawl"],
  ["lc-schema"],
  ["lc-render"],
  ["lc-content"],
  ["lc-content"],
];

let loadingInterval = null;
let loadingIndex = 0;

function startLoading() {
  loadingPanel.classList.remove("hidden");
  loadingIndex = 0;
  loadingStep.textContent = LOADING_STEPS[0];
  document.querySelectorAll(".lc-item").forEach(el => el.classList.remove("lc-active"));

  loadingInterval = setInterval(() => {
    loadingIndex = Math.min(loadingIndex + 1, LOADING_STEPS.length - 1);
    loadingStep.textContent = LOADING_STEPS[loadingIndex];
    document.querySelectorAll(".lc-item").forEach(el => el.classList.remove("lc-active"));
    const activeIds = LC_SEQUENCE[loadingIndex] ?? [];
    activeIds.forEach(id => document.getElementById(id)?.classList.add("lc-active"));
  }, 2200);
}

function stopLoading() {
  clearInterval(loadingInterval);
  loadingPanel.classList.add("hidden");
  document.querySelectorAll(".lc-item").forEach(el => el.classList.remove("lc-active"));
}

// ── Render full report ────────────────────────────────────
function renderReport(payload) {
  const { report, score, classification, moduleBreakdown } = payload;

  scoreBadge.style.setProperty("--pct", String(score));
  scoreBadge.style.setProperty("--score-color", scoreColor(score));
  scoreValue.textContent = String(score);

  const cm = CLASSIFICATION_META[classification] ?? { color: "var(--text)" };
  const icons = { Excellent: "✓", Good: "✓", Risky: "⚠", Broken: "✕" };
  resultTitle.innerHTML = `<span class="classification-icon">${icons[classification] ?? ""}</span> ${classification}`;
  resultTitle.style.color = cm.color;

  const checkedAt = new Date(report.checkedAt ?? Date.now()).toLocaleString(undefined, {
    dateStyle: "medium", timeStyle: "short",
  });
  resultSummary.innerHTML = `<span class="summary-url">${report.url}</span><span class="summary-sep">·</span>${checkedAt}`;

  renderRadar(moduleBreakdown);
  renderBar(report.checks);
  renderStats(report.checks);
  renderChecks(report.checks);

  jsonOutput.textContent = JSON.stringify(payload, null, 2);
  showResultPanels();
}

// ── Render error ──────────────────────────────────────────
function renderError(message) {
  scoreBadge.style.setProperty("--pct", "0");
  scoreBadge.style.setProperty("--score-color", FAIL_CLR);
  scoreValue.textContent = "—";
  resultTitle.innerHTML = `<span class="classification-icon">✕</span> Failed`;
  resultTitle.style.color = FAIL_CLR;
  resultSummary.innerHTML = `<span class="summary-url">${message}</span>`;
  statRow.innerHTML = "";
  document.querySelectorAll(".checks-grid").forEach(g => g.replaceChildren());
  jsonOutput.textContent = "";
  showResultPanels();
}

// ── Form submit ───────────────────────────────────────────
form.addEventListener("submit", async (event) => {
  event.preventDefault();

  // Reset panels
  [statusPanel, checksPanel, jsonPanel].forEach(p => p.classList.add("hidden"));

  submitButton.disabled = true;
  btnText.classList.add("hidden");
  btnSpinner.classList.remove("hidden");
  startLoading();

  try {
    const response = await fetch("/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: urlInput.value.trim() }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.message ?? "Analysis failed");
    stopLoading();
    renderReport(payload);
  } catch (error) {
    stopLoading();
    renderError(error instanceof Error ? error.message : String(error));
  } finally {
    submitButton.disabled = false;
    btnText.classList.remove("hidden");
    btnSpinner.classList.add("hidden");
  }
});
