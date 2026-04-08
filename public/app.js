const form          = document.querySelector("#analyze-form");
const urlInput      = document.querySelector("#url-input");
const submitButton  = document.querySelector("#submit-button");
const statusPanel   = document.querySelector("#status-panel");
const checksPanel   = document.querySelector("#checks-panel");
const jsonPanel     = document.querySelector("#json-panel");
const resultTitle   = document.querySelector("#result-title");
const resultSummary = document.querySelector("#result-summary");
const scoreValue    = document.querySelector("#score-value");
const scoreBadge    = document.querySelector("#score-badge");
const statRow       = document.querySelector("#stat-row");
const checksGrid    = document.querySelector("#checks-grid");
const jsonOutput    = document.querySelector("#json-output");
const checkCardTemplate = document.querySelector("#check-card-template");

// ── Chart instances (destroyed on re-run) ────────────────
let radarChart = null;
let barChart   = null;

// ── Meta maps ─────────────────────────────────────────────
const checkMeta = {
  fetchability:        { label: "Fetchability",   icon: "🌐" },
  robotsTxt:           { label: "Robots.txt",      icon: "🤖" },
  botAccessSimulation: { label: "Bot Access",      icon: "🔍" },
  javascriptRendering: { label: "JS Rendering",    icon: "⚡" },
  htmlParsability:     { label: "HTML Parsing",    icon: "🧩" },
  contentExtraction:   { label: "Content Quality", icon: "📄" },
};

const breakdownMeta = {
  fetchability:   "Fetchability",
  botAccess:      "Bot Access",
  rendering:      "Rendering",
  parsing:        "Parsing",
  contentQuality: "Content",
};

const classificationMeta = {
  Excellent: { emoji: "✅", color: "#1a7a45" },
  Good:      { emoji: "👍", color: "#2a7a7a" },
  Risky:     { emoji: "⚠️", color: "#8a6618" },
  Broken:    { emoji: "❌", color: "#8a2838" },
};

const statusMeta = {
  PASS:    { icon: "✓", label: "Pass",    cls: "status-pass"    },
  WARNING: { icon: "△", label: "Warn",    cls: "status-warning" },
  FAIL:    { icon: "✕", label: "Fail",    cls: "status-fail"    },
};

// ── Chart colours ─────────────────────────────────────────
const ACCENT      = "#3b7a62";
const ACCENT_FILL = "rgba(59,122,98,0.15)";
const PASS_CLR    = "#1a7a45";
const WARN_CLR    = "#8a6618";
const FAIL_CLR    = "#8a2838";

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

  const labels = Object.keys(breakdown).map(k => breakdownMeta[k] ?? k);
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
          ticks: {
            stepSize: 25,
            display: false,
          },
          grid:        { color: "rgba(0,0,0,0.07)" },
          angleLines:  { color: "rgba(0,0,0,0.07)" },
          pointLabels: { font: { size: 12, weight: "600" }, color: "#1a2a22" },
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

// ── Horizontal bar chart ──────────────────────────────────
function renderBar(checks) {
  if (barChart) { barChart.destroy(); barChart = null; }

  const entries = Object.entries(checks);
  const labels  = entries.map(([k]) => checkMeta[k]?.label ?? k);
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
          ticks: { font: { size: 12, weight: "600" }, color: "#1a2a22" },
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

// ── Check cards ───────────────────────────────────────────
function renderChecks(checks) {
  checksGrid.replaceChildren();
  Object.entries(checks).forEach(([key, value]) => {
    const node = checkCardTemplate.content.firstElementChild.cloneNode(true);
    const cm   = checkMeta[key] ?? { label: key, icon: "●" };
    const sm   = statusMeta[value.status] ?? { icon: "?", label: value.status, cls: "" };
    node.querySelector(".check-icon").textContent  = cm.icon;
    node.querySelector(".check-title").textContent = cm.label;
    const pill = node.querySelector(".status-pill");
    pill.innerHTML  = `<span class="pill-icon">${sm.icon}</span>${sm.label}`;
    pill.className  = `status-pill ${sm.cls}`;
    node.querySelector(".check-reason").textContent = value.reason;
    checksGrid.appendChild(node);
  });
}

// ── Show panels ───────────────────────────────────────────
function showPanels() {
  [statusPanel, checksPanel, jsonPanel].forEach(p => {
    p.classList.remove("hidden");
    p.style.animation = "none";
    p.offsetHeight;
    p.style.animation = "";
  });
}

// ── Render full report ────────────────────────────────────
function renderReport(payload) {
  const { report, score, classification, moduleBreakdown } = payload;

  // Score ring
  scoreBadge.style.setProperty("--pct", String(score));
  scoreBadge.style.setProperty("--score-color", scoreColor(score));
  scoreValue.textContent = String(score);

  // Title
  const cm = classificationMeta[classification] ?? { emoji: "", color: "var(--text)" };
  resultTitle.innerHTML = `<span class="classification-emoji">${cm.emoji}</span> ${classification}`;
  resultTitle.style.color = cm.color;

  // Metadata
  const checkedAt = new Date(report.checkedAt ?? Date.now()).toLocaleString(undefined, {
    dateStyle: "medium", timeStyle: "short",
  });
  resultSummary.innerHTML = `<span class="summary-url">${report.url}</span><span class="summary-sep">·</span>${checkedAt}`;

  // Charts + stats
  renderRadar(moduleBreakdown);
  renderBar(report.checks);
  renderStats(report.checks);
  renderChecks(report.checks);

  jsonOutput.textContent = JSON.stringify(payload, null, 2);
  showPanels();
}

// ── Render error ──────────────────────────────────────────
function renderError(message) {
  scoreBadge.style.setProperty("--pct", "0");
  scoreBadge.style.setProperty("--score-color", FAIL_CLR);
  scoreValue.textContent = "—";
  resultTitle.innerHTML = `<span class="classification-emoji">❌</span> Failed`;
  resultTitle.style.color = FAIL_CLR;
  resultSummary.innerHTML = `<span class="summary-url">${message}</span>`;
  statRow.innerHTML = "";
  checksGrid.replaceChildren();
  jsonOutput.textContent = "";
  showPanels();
}

// ── Form submit ───────────────────────────────────────────
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  submitButton.disabled = true;
  submitButton.textContent = "Analyzing…";

  try {
    const response = await fetch("/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: urlInput.value.trim() }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.message ?? "Analysis failed");
    renderReport(payload);
  } catch (error) {
    renderError(error instanceof Error ? error.message : String(error));
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Analyze";
  }
});
