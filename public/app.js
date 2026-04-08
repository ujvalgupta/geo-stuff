// ── DOM refs ──────────────────────────────────────────────
const form          = document.querySelector("#analyze-form");
const urlInput      = document.querySelector("#url-input");
const submitButton  = document.querySelector("#submit-button");
const btnText       = submitButton.querySelector(".btn-text");
const btnSpinner    = submitButton.querySelector(".btn-spinner");
const loadingPanel  = document.querySelector("#loading-panel");
const loadingStep   = document.querySelector("#loading-step");
const statusPanel   = document.querySelector("#status-panel");
const checksPanel   = document.querySelector("#checks-panel");
const jsonPanel     = document.querySelector("#json-panel");
const resultTitle   = document.querySelector("#result-title");
const resultSummary = document.querySelector("#result-summary");
const scoreValue    = document.querySelector("#score-value");
const scoreBadge    = document.querySelector("#score-badge");
const statRow       = document.querySelector("#stat-row");
const jsonOutput    = document.querySelector("#json-output");
const tmpl          = document.querySelector("#check-card-template");

let radarChart = null;
let barChart   = null;

// ── Check meta ────────────────────────────────────────────
const CHECK_META = {
  fetchability:        { label: "Fetchability",       icon: "⚡", grid: "grid-fetchability" },
  robotsTxt:           { label: "Robots.txt",          icon: "🤖", grid: "grid-botaccess" },
  botAccessSimulation: { label: "Bot Simulation",      icon: "🔍", grid: "grid-botaccess" },
  llmsTxt:             { label: "llms.txt / ai.txt",   icon: "🧠", grid: "grid-botaccess" },
  metaRobots:          { label: "Meta Robots",         icon: "🏷️", grid: "grid-crawlsignals" },
  canonical:           { label: "Canonical Tag",       icon: "🔗", grid: "grid-crawlsignals" },
  sitemap:             { label: "Sitemap Quality",     icon: "🗺️", grid: "grid-crawlsignals" },
  internalLinkDepth:   { label: "Link Depth",          icon: "🕸️", grid: "grid-crawlsignals" },
  structuredData:      { label: "Structured Data",     icon: "📐", grid: "grid-structureddata" },
  eeatSignals:         { label: "E-E-A-T Signals",     icon: "🏆", grid: "grid-structureddata" },
  javascriptRendering: { label: "JS Rendering",        icon: "🖥️", grid: "grid-rendering" },
  coreWebVitals:       { label: "Core Web Vitals",     icon: "📊", grid: "grid-rendering" },
  contentExtraction:   { label: "Content Quality",     icon: "📄", grid: "grid-content" },
  openGraph:           { label: "Open Graph",          icon: "🪟", grid: "grid-content" },
  contentFreshness:    { label: "Content Freshness",   icon: "🕐", grid: "grid-content" },
  multiPageSample:     { label: "Site Health Sample",  icon: "🌐", grid: "grid-sitehealth" },
};

const BREAKDOWN_META = {
  fetchability:   "Fetchability",
  botAccess:      "Bot Access",
  crawlSignals:   "Crawl Signals",
  structuredData: "Structured Data",
  rendering:      "Rendering",
  contentQuality: "Content",
  siteHealth:     "Site Health",
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

// ── Safe HTML helper ──────────────────────────────────────
function esc(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

Chart.defaults.font.family = "'Inter', system-ui, sans-serif";
Chart.defaults.color       = "#5a7068";

// ── Radar ─────────────────────────────────────────────────
function renderRadar(breakdown) {
  if (radarChart) { radarChart.destroy(); radarChart = null; }
  const labels = Object.keys(breakdown).map(k => BREAKDOWN_META[k] ?? k);
  const data   = Object.values(breakdown).map(v => Math.round(v * 100));

  radarChart = new Chart(document.getElementById("radar-chart"), {
    type: "radar",
    data: {
      labels,
      datasets: [{
        label: "Score", data, fill: true,
        backgroundColor: ACCENT_FILL, borderColor: ACCENT, borderWidth: 2,
        pointBackgroundColor: data.map(v => scoreColor(v)),
        pointBorderColor: "#fff", pointRadius: 5, pointHoverRadius: 7,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: true,
      animation: { duration: 700, easing: "easeInOutQuart" },
      scales: {
        r: {
          min: 0, max: 100,
          ticks: { stepSize: 25, display: false },
          grid: { color: "rgba(0,0,0,0.07)" },
          angleLines: { color: "rgba(0,0,0,0.07)" },
          pointLabels: { font: { size: 10, weight: "600" }, color: "#1a2a22" },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { label: ctx => ` ${ctx.raw}%` },
          backgroundColor: "#fff", titleColor: "#1a2a22", bodyColor: "#5a7068",
          borderColor: "rgba(0,0,0,0.08)", borderWidth: 1, padding: 10, cornerRadius: 10,
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
        label: "Score", data,
        backgroundColor: colors.map(c => c + "22"),
        borderColor: colors, borderWidth: 2,
        borderRadius: 6, borderSkipped: false,
      }],
    },
    options: {
      indexAxis: "y", responsive: true, maintainAspectRatio: false,
      animation: { duration: 700, easing: "easeInOutQuart" },
      scales: {
        x: {
          min: 0, max: 100,
          ticks: { callback: v => `${v}%`, font: { size: 10 } },
          grid: { color: "rgba(0,0,0,0.06)" }, border: { display: false },
        },
        y: {
          ticks: { font: { size: 10, weight: "600" }, color: "#1a2a22" },
          grid: { display: false }, border: { display: false },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { label: ctx => ` ${ctx.raw}%` },
          backgroundColor: "#fff", titleColor: "#1a2a22", bodyColor: "#5a7068",
          borderColor: "rgba(0,0,0,0.08)", borderWidth: 1, padding: 10, cornerRadius: 10,
        },
      },
    },
  });
}

// ── Stats ─────────────────────────────────────────────────
function renderStats(checks) {
  const counts = { PASS: 0, WARNING: 0, FAIL: 0 };
  Object.values(checks).forEach(v => counts[v.status]++);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  statRow.innerHTML = `
    <div class="stat-pill stat-pill--pass">
      <span class="stat-num">${counts.PASS}</span><span class="stat-lbl">Passed</span>
      <span class="stat-bar"><span style="width:${(counts.PASS/total)*100}%"></span></span>
    </div>
    <div class="stat-pill stat-pill--warn">
      <span class="stat-num">${counts.WARNING}</span><span class="stat-lbl">Warnings</span>
      <span class="stat-bar"><span style="width:${(counts.WARNING/total)*100}%"></span></span>
    </div>
    <div class="stat-pill stat-pill--fail">
      <span class="stat-num">${counts.FAIL}</span><span class="stat-lbl">Failed</span>
      <span class="stat-bar"><span style="width:${(counts.FAIL/total)*100}%"></span></span>
    </div>
    <div class="stat-pill stat-pill--total">
      <span class="stat-num">${total}</span><span class="stat-lbl">Total checks</span>
    </div>
  `;
}

// ── Metric helpers ────────────────────────────────────────
function metricRow(label, value, cls = "") {
  if (value === null || value === undefined || value === "") return "";
  return `<div class="mrow"><span class="mrow-label">${esc(label)}</span><span class="mrow-value ${cls}">${esc(String(value))}</span></div>`;
}

function boolBadge(label, val) {
  if (val === null || val === undefined) return "";
  const cls = val ? "mbadge mbadge--pass" : "mbadge mbadge--fail";
  const icon = val ? "✓" : "✕";
  return `<span class="${cls}">${icon} ${esc(label)}</span>`;
}

function tagChip(label, type = "neutral") {
  return `<span class="mchip mchip--${type}">${esc(label)}</span>`;
}

function scoreBar(pct, label = "") {
  const color = pct >= 70 ? "var(--pass)" : pct >= 40 ? "var(--warn)" : "var(--fail)";
  return `
    <div class="mbar-wrap">
      ${label ? `<span class="mbar-label">${esc(label)}</span>` : ""}
      <div class="mbar-track"><div class="mbar-fill" style="width:${Math.max(2, pct)}%;background:${color}"></div></div>
      <span class="mbar-pct" style="color:${color}">${Math.round(pct)}%</span>
    </div>`;
}

// ── Per-check metric HTML builders ───────────────────────
function buildMetricsHTML(key, m) {
  switch (key) {

    case "fetchability": {
      const statusCode = m.statusCode ?? "—";
      const statusClass = statusCode >= 200 && statusCode < 300 ? "mbadge--pass" : statusCode >= 300 && statusCode < 400 ? "mbadge--warn" : "mbadge--fail";
      return `
        <div class="mgroup">
          <div class="mbadge-row">
            <span class="mbadge ${statusClass}">HTTP ${esc(statusCode)}</span>
            ${boolBadge("DNS", m.dnsResolved)}
            ${m.tlsChecked ? boolBadge("TLS", m.tlsOk) : ""}
            ${m.has302InChain ? `<span class="mbadge mbadge--warn">302 redirect</span>` : ""}
          </div>
          <div class="mrows">
            ${m.finalUrl ? metricRow("Final URL", m.finalUrl) : ""}
            ${m.durationMs != null ? metricRow("Response time", `${m.durationMs}ms`) : ""}
            ${m.redirectCount != null ? metricRow("Redirect hops", m.redirectCount === 0 ? "None" : `${m.redirectCount} hop${m.redirectCount > 1 ? "s" : ""}`) : ""}
          </div>
        </div>`;
    }

    case "robotsTxt": {
      const evals = Array.isArray(m.evaluations) ? m.evaluations : [];
      const botRows = evals.map(e =>
        `<div class="bot-row">
          <span class="bot-name">${esc(e.userAgent)}</span>
          <span class="bot-status ${e.allowed ? "bot-pass" : "bot-fail"}">${e.allowed ? "✓ Allowed" : "✕ Blocked"}</span>
        </div>`
      ).join("");
      return `
        <div class="mgroup">
          <div class="mrows">
            ${metricRow("Robots URL", m.robotsUrl)}
            ${metricRow("Crawl-delay", m.crawlDelay != null ? `${m.crawlDelay}s` : "Not set")}
          </div>
          ${botRows ? `<div class="bot-table">${botRows}</div>` : ""}
        </div>`;
    }

    case "botAccessSimulation": {
      const sims = Array.isArray(m.simulations) ? m.simulations : [];
      const grid = sims.map(s =>
        `<div class="bot-chip ${s.accessible ? "bot-chip--pass" : "bot-chip--fail"}">
          <span class="bot-chip-dot"></span>
          <span class="bot-chip-name">${esc(s.botName)}</span>
          ${s.comparisonToBrowser?.similarityScore != null
            ? `<span class="bot-chip-sim">${s.comparisonToBrowser.similarityScore}%</span>`
            : ""}
        </div>`
      ).join("");
      const blocked = Array.isArray(m.blockedBots) ? m.blockedBots : [];
      const divergent = Array.isArray(m.divergentBots) ? m.divergentBots : [];
      return `
        <div class="mgroup">
          <div class="bot-chip-grid">${grid || `<span class="muted-note">No simulations recorded</span>`}</div>
          ${blocked.length ? `<p class="mwarning">Blocked: ${blocked.map(esc).join(", ")}</p>` : ""}
          ${divergent.length ? `<p class="mwarning">Divergent content: ${divergent.map(esc).join(", ")}</p>` : ""}
          <p class="mmeta">Similarity = Jaccard overlap of content words vs browser view</p>
        </div>`;
    }

    case "llmsTxt": {
      const found = Array.isArray(m.foundFiles) && m.foundFiles.length > 0;
      const p = m.parsed ?? {};
      const score = typeof m.normalizedScore === "number" ? Math.round(m.normalizedScore * 100) : null;
      return `
        <div class="mgroup">
          <div class="mbadge-row">
            ${boolBadge("File found", found)}
            ${found ? boolBadge("No block rules", !p.hasBlockRules) : ""}
            ${found ? boolBadge("Allow rules", p.hasAllowRules ?? false) : ""}
          </div>
          <div class="mrows">
            ${m.primaryFile ? metricRow("File", m.primaryFile) : ""}
            ${m.fileSize ? metricRow("Size", `${m.fileSize} bytes`) : ""}
            ${p.title ? metricRow("Title", p.title) : ""}
            ${p.description ? metricRow("Description", p.description) : ""}
            ${p.sectionCount != null ? metricRow("Sections", p.sectionCount) : ""}
            ${p.linkCount != null ? metricRow("Content links", p.linkCount) : ""}
          </div>
          ${score !== null ? scoreBar(score, "Quality score") : ""}
        </div>`;
    }

    case "metaRobots": {
      const details = Array.isArray(m.details) ? m.details : [];
      const blocking = Array.isArray(m.blockingDirectivesFound) && m.blockingDirectivesFound.length > 0;
      return `
        <div class="mgroup">
          <div class="mbadge-row">
            ${boolBadge("Tags found", (m.tagsFound ?? 0) > 0)}
            ${blocking
              ? `<span class="mbadge mbadge--fail">Blocking directives</span>`
              : `<span class="mbadge mbadge--pass">No blocks</span>`}
          </div>
          ${details.length
            ? `<div class="directive-list">
                ${details.map(d =>
                  `<div class="directive-row">
                    <span class="directive-src">${esc(d.source)}</span>
                    <code class="directive-val">${esc(d.rawContent)}</code>
                  </div>`
                ).join("")}
              </div>`
            : `<p class="muted-note">No meta robot tags found</p>`}
          ${blocking
            ? `<p class="mwarning">Blocking: ${(m.blockingDirectivesFound ?? []).map(esc).join(", ")}</p>`
            : ""}
        </div>`;
    }

    case "canonical": {
      return `
        <div class="mgroup">
          <div class="mbadge-row">
            ${boolBadge("Self-referencing", m.isSelfReferencing ?? false)}
            ${m.canonicalUrl ? boolBadge("Canonical set", true) : `<span class="mbadge mbadge--fail">No canonical tag</span>`}
          </div>
          <div class="mrows">
            ${m.canonicalUrl ? metricRow("Canonical URL", m.canonicalUrl) : ""}
          </div>
        </div>`;
    }

    case "sitemap": {
      const q = m.quality ?? {};
      const pct = q.pctWithLastmod ?? 0;
      const pctClass = pct >= 80 ? "mval--pass" : pct >= 50 ? "mval--warn" : "mval--fail";
      const issues = Array.isArray(m.qualityIssues) ? m.qualityIssues : [];
      return `
        <div class="mgroup">
          <div class="mbadge-row">
            ${boolBadge("Sitemap found", !!m.sitemapUrl)}
            ${m.urlInSitemap != null ? boolBadge("URL listed", m.urlInSitemap) : ""}
            ${q.exceedsLimit ? `<span class="mbadge mbadge--fail">≥50k URL limit</span>` : ""}
          </div>
          <div class="mrows">
            ${m.sitemapUrl ? metricRow("Sitemap URL", m.sitemapUrl) : ""}
            ${q.urlCount != null ? metricRow("Total URLs", q.urlCount.toLocaleString()) : ""}
            ${q.newestLastmod ? metricRow("Newest lastmod", new Date(q.newestLastmod).toLocaleDateString()) : ""}
            ${q.oldestLastmod ? metricRow("Oldest lastmod", new Date(q.oldestLastmod).toLocaleDateString()) : ""}
          </div>
          ${q.urlCount > 0
            ? `<div class="mbar-wrap">
                <span class="mbar-label">URLs with lastmod</span>
                <div class="mbar-track"><div class="mbar-fill" style="width:${pct}%;background:${pct >= 80 ? "var(--pass)" : pct >= 50 ? "var(--warn)" : "var(--fail)"}"></div></div>
                <span class="mbar-pct ${pctClass}">${pct}%</span>
              </div>`
            : ""}
          ${issues.length ? `<p class="mwarning">${issues.map(esc).join(" · ")}</p>` : ""}
        </div>`;
    }

    case "internalLinkDepth": {
      const depth = m.depth;
      const isHome = m.isHomepage;
      const depthLabel = isHome ? "Homepage" : depth === 1 ? "Depth 1 — linked from homepage" : depth === 2 ? "Depth 2" : depth === 3 ? "Depth 3" : depth != null ? `Depth ${depth}` : "Not found within depth 3";
      const depthColor = isHome || depth === 1 || depth === 2 ? "var(--pass)" : depth === 3 ? "var(--warn)" : "var(--fail)";
      return `
        <div class="mgroup">
          <div class="depth-indicator">
            <span class="depth-label">Link depth from homepage</span>
            <span class="depth-value" style="color:${depthColor}">${esc(depthLabel)}</span>
          </div>
          <div class="depth-track">
            <div class="depth-step ${(!depth || depth >= 1) ? "depth-done" : ""}">Homepage</div>
            <div class="depth-arrow">→</div>
            <div class="depth-step ${depth >= 2 ? "depth-done" : depth === 1 ? "depth-current" : ""}">Depth 1</div>
            <div class="depth-arrow">→</div>
            <div class="depth-step ${depth >= 3 ? "depth-done" : depth === 2 ? "depth-current" : ""}">Depth 2</div>
            <div class="depth-arrow">→</div>
            <div class="depth-step ${depth >= 4 ? "depth-done" : depth === 3 ? "depth-current" : ""}">Depth 3</div>
          </div>
          <div class="mrows">
            ${m.homepageLinkCount != null ? metricRow("Homepage outlinks", m.homepageLinkCount) : ""}
            ${m.level2PagesChecked != null ? metricRow("Depth-2 pages sampled", m.level2PagesChecked) : ""}
            ${m.level3PagesChecked != null ? metricRow("Depth-3 pages sampled", m.level3PagesChecked) : ""}
          </div>
        </div>`;
    }

    case "structuredData": {
      const types = Array.isArray(m.schemaTypes) ? m.schemaTypes : [];
      const recognized = Array.isArray(m.recognizedTypes) ? m.recognizedTypes : [];
      const missing = Array.isArray(m.missingFields) ? m.missingFields : [];
      return `
        <div class="mgroup">
          <div class="mbadge-row">
            ${boolBadge("JSON-LD found", (m.totalBlocks ?? 0) > 0)}
            ${boolBadge("Valid @context", m.hasValidContext)}
            ${(m.parseErrors ?? 0) > 0 ? `<span class="mbadge mbadge--fail">${m.parseErrors} parse error(s)</span>` : ""}
            ${m.titleMismatch ? `<span class="mbadge mbadge--warn">Title mismatch</span>` : ""}
          </div>
          <div class="mrows">
            ${metricRow("JSON-LD blocks", m.totalBlocks ?? 0)}
          </div>
          ${types.length
            ? `<div class="tag-section">
                <span class="tag-section-label">Schema types found</span>
                <div class="tag-wrap">
                  ${types.map(t => tagChip(t, recognized.includes(t) ? "pass" : "neutral")).join("")}
                </div>
              </div>`
            : `<p class="muted-note">No JSON-LD schema found</p>`}
          ${missing.length
            ? `<div class="tag-section">
                <span class="tag-section-label">Missing fields</span>
                <div class="tag-wrap">
                  ${missing.map(f => tagChip(f, "fail")).join("")}
                </div>
              </div>`
            : ""}
        </div>`;
    }

    case "eeatSignals": {
      const found = Array.isArray(m.foundSignals) ? m.foundSignals : [];
      const missing = Array.isArray(m.missingSignals) ? m.missingSignals : [];
      const score = typeof m.normalizedScore === "number" ? Math.round(m.normalizedScore * 100) : null;
      const ALL_SIGNALS = [
        "Author schema", "Author name", "Social profiles (sameAs)", "HTML byline",
        "Org schema", "Org logo", "Org contact", "Publisher in Article",
        "About/Team link", "Contact link", "Authoritative external citations"
      ];
      const foundLower = found.map(s => s.toLowerCase());
      return `
        <div class="mgroup">
          ${score !== null ? scoreBar(score, `E-E-A-T score (${m.foundCount ?? "?"} / ${m.totalSignals ?? 11} signals)`) : ""}
          <div class="signal-grid">
            ${ALL_SIGNALS.map(sig => {
              const hit = found.some(f => f.toLowerCase().includes(sig.toLowerCase().split(" ")[0]));
              return `<div class="signal-item ${hit ? "signal-pass" : "signal-fail"}">
                <span class="signal-dot"></span>${esc(sig)}
              </div>`;
            }).join("")}
          </div>
          ${m.authoritativeLinkCount != null
            ? `<p class="mmeta">External authoritative links: ${m.authoritativeLinkCount}</p>`
            : ""}
        </div>`;
    }

    case "javascriptRendering": {
      const mode = m.inferredRenderingMode ?? "Unknown";
      const modeColor = mode === "static" ? "var(--pass)" : mode === "hybrid" ? "var(--warn)" : "var(--fail)";
      return `
        <div class="mgroup">
          <div class="mbadge-row">
            ${boolBadge("Playwright available", m.playwrightAvailable)}
            <span class="mbadge" style="background:${modeColor}22;color:${modeColor};border-color:${modeColor}44">
              ${esc(mode)} rendering
            </span>
          </div>
          <div class="mrows">
            ${m.scriptTagCount != null ? metricRow("Script tags", m.scriptTagCount) : ""}
            ${m.renderDependencyScore != null ? metricRow("Render dependency", m.renderDependencyScore) : ""}
          </div>
        </div>`;
    }

    case "coreWebVitals": {
      if (!m.available || !m.metrics) {
        return `
          <div class="mgroup">
            <p class="muted-note">${m.playwrightAvailable === false ? "Playwright not available — install with: npx playwright install chromium" : "Core Web Vitals measurement not available for this page"}</p>
          </div>`;
      }
      const WEIGHTS = { lcp: 30, cls: 25, fcp: 20, ttfb: 15, tbt: 10 };
      const cwvRows = Object.entries(m.metrics).map(([k, metric]) => {
        const weight = WEIGHTS[k] ?? 0;
        const ratingColor = metric.rating === "good" ? "var(--pass)" : metric.rating === "needs-improvement" ? "var(--warn)" : "var(--fail)";
        const pct = metric.rating === "good" ? 100 : metric.rating === "needs-improvement" ? 55 : 15;
        return `
          <div class="cwv-row">
            <div class="cwv-meta">
              <span class="cwv-key">${k.toUpperCase()}</span>
              <span class="cwv-weight">${weight}%</span>
            </div>
            <div class="cwv-bar-wrap">
              <div class="cwv-track"><div class="cwv-fill" style="width:${pct}%;background:${ratingColor}"></div></div>
            </div>
            <div class="cwv-vals">
              <span class="cwv-measured" style="color:${ratingColor}">${esc(metric.formatted)}</span>
              <span class="cwv-rating ${metric.rating === "good" ? "rating-good" : metric.rating === "needs-improvement" ? "rating-warn" : "rating-poor"}">${metric.rating}</span>
            </div>
          </div>`;
      }).join("");
      return `<div class="mgroup"><div class="cwv-list">${cwvRows}</div><p class="mmeta">Thresholds: LCP ≤2.5s · CLS ≤0.1 · FCP ≤1.8s · TTFB ≤0.8s · TBT ≤200ms</p></div>`;
    }

    case "contentExtraction": {
      const wc = m.extractedWordCount ?? 0;
      const wcColor = wc >= 300 ? "var(--pass)" : wc >= 100 ? "var(--warn)" : "var(--fail)";
      return `
        <div class="mgroup">
          <div class="mbadge-row">
            <span class="mbadge" style="background:${wcColor}22;color:${wcColor};border-color:${wcColor}44">
              ${wc.toLocaleString()} words
            </span>
            ${m.extractionSource ? `<span class="mbadge mbadge--neutral">${esc(m.extractionSource)}</span>` : ""}
          </div>
          <div class="mrows">
            ${m.title ? metricRow("Title", m.title) : ""}
            ${m.metaDescription ? metricRow("Meta desc", m.metaDescription) : ""}
          </div>
          ${m.textSample
            ? `<div class="text-sample"><span class="text-sample-label">Text sample</span><p>${esc(m.textSample)}</p></div>`
            : ""}
        </div>`;
    }

    case "openGraph": {
      const ALL_OG = ["og:title","og:description","og:image","og:type","og:url","twitter:card"];
      const present = Array.isArray(m.present) ? m.present : [];
      const fields = m.fields ?? {};
      return `
        <div class="mgroup">
          <div class="og-grid">
            ${ALL_OG.map(tag => {
              const has = present.includes(tag);
              const val = fields[tag];
              return `<div class="og-item ${has ? "og-pass" : "og-fail"}">
                <span class="og-dot"></span>
                <span class="og-tag-name">${esc(tag)}</span>
                ${val ? `<span class="og-val" title="${esc(val)}">${esc(String(val).length > 40 ? String(val).slice(0, 40) + "…" : val)}</span>` : `<span class="og-missing">missing</span>`}
              </div>`;
            }).join("")}
          </div>
          ${present.length < ALL_OG.length
            ? `<p class="mwarning">Missing: ${ALL_OG.filter(t => !present.includes(t)).map(esc).join(", ")}</p>`
            : `<p class="mmeta">All Open Graph tags present</p>`}
        </div>`;
    }

    case "contentFreshness": {
      const age = m.ageInDays;
      const mode = m.contentModeLabel ?? "Unknown";
      const freshness = m.freshnessLabel ?? "—";
      const freshnessColor = freshness === "Fresh" ? "var(--pass)" : freshness === "Recent" ? "var(--pass)" : freshness === "Aging" ? "var(--warn)" : "var(--fail)";
      return `
        <div class="mgroup">
          <div class="mbadge-row">
            <span class="mbadge mbadge--neutral">${esc(mode)}</span>
            ${age != null
              ? `<span class="mbadge" style="background:${freshnessColor}22;color:${freshnessColor};border-color:${freshnessColor}44">
                  ${age} days old · ${esc(freshness)}
                </span>`
              : `<span class="mbadge mbadge--warn">No date found</span>`}
          </div>
          <div class="mrows">
            ${m.bestSignalSource ? metricRow("Date source", m.bestSignalSource) : ""}
            ${m.bestSignalDate ? metricRow("Date", new Date(m.bestSignalDate).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })) : ""}
          </div>
        </div>`;
    }

    case "multiPageSample": {
      const st = m.siteWideStats ?? {};
      const pages = Array.isArray(m.pages) ? m.pages : [];
      const issues = Array.isArray(m.issues) ? m.issues : [];
      const jldPct = st.pctWithJsonLd ?? 0;
      const canPct = st.pctWithSelfCanonical ?? 0;
      const noiPct = st.pctWithNoindex ?? 0;
      return `
        <div class="mgroup">
          <div class="site-stats-grid">
            ${scoreBar(jldPct, "JSON-LD coverage")}
            ${scoreBar(canPct, "Self-canonical")}
            ${noiPct > 0
              ? `<div class="mbar-wrap">
                  <span class="mbar-label">Noindexed pages</span>
                  <div class="mbar-track"><div class="mbar-fill" style="width:${noiPct}%;background:var(--fail)"></div></div>
                  <span class="mbar-pct mval--fail">${noiPct}%</span>
                </div>`
              : ""}
          </div>
          <div class="mrows">
            ${metricRow("Pages sampled", m.pagesSampled ?? pages.length)}
            ${st.errorPageCount ? metricRow("Error pages (4xx/5xx)", st.errorPageCount, "mval--fail") : ""}
            ${st.missingTitleCount ? metricRow("Missing title tags", st.missingTitleCount, "mval--warn") : ""}
          </div>
          ${pages.length
            ? `<div class="page-table">
                <div class="page-row page-row--head">
                  <span>Page</span><span>Status</span><span>JSON-LD</span><span>Canonical</span><span>Noindex</span>
                </div>
                ${pages.map(p => {
                  let path = "—";
                  try { path = new URL(p.url).pathname || "/"; } catch(e) {}
                  const sc = p.statusCode;
                  const scCls = sc >= 200 && sc < 300 ? "pcell--pass" : sc >= 400 ? "pcell--fail" : "pcell--warn";
                  return `<div class="page-row">
                    <span class="page-path" title="${esc(p.url)}">${esc(path)}</span>
                    <span class="${scCls}">${esc(sc ?? "err")}</span>
                    <span class="${p.hasJsonLd ? "pcell--pass" : "pcell--fail"}">${p.hasJsonLd ? "✓" : "✕"}</span>
                    <span class="${p.hasSelfCanonical ? "pcell--pass" : "pcell--warn"}">${p.hasSelfCanonical ? "✓" : "✕"}</span>
                    <span class="${p.hasNoindex ? "pcell--fail" : "pcell--pass"}">${p.hasNoindex ? "!" : "—"}</span>
                  </div>`;
                }).join("")}
              </div>`
            : ""}
          ${issues.length ? `<p class="mwarning">${issues.map(esc).join(" · ")}</p>` : ""}
        </div>`;
    }

    default:
      return "";
  }
}

// ── Detail rows (raw data for expand) ────────────────────
function buildDetailRows(key, metadata) {
  const rows = [];
  const add = (label, value) => {
    if (value === null || value === undefined || value === "") return;
    rows.push({ label, value: String(value) });
  };
  const addBool = (label, value) => {
    if (value === null || value === undefined) return;
    rows.push({ label, value: value ? "Yes" : "No", bool: value });
  };
  const addList = (label, arr) => {
    if (!Array.isArray(arr) || arr.length === 0) return;
    rows.push({ label, value: arr.join(", ") });
  };

  switch (key) {
    case "fetchability":
      add("Final URL", metadata.finalUrl);
      add("Status Code", metadata.statusCode);
      add("Duration", metadata.durationMs != null ? `${metadata.durationMs}ms` : null);
      add("Redirects", metadata.redirectCount != null ? `${metadata.redirectCount} hop(s)` : null);
      addBool("DNS Resolved", metadata.dnsResolved);
      addBool("TLS OK", metadata.tlsChecked ? metadata.tlsOk : null);
      addBool("302 in Chain", metadata.has302InChain ?? false);
      break;
    case "robotsTxt":
      add("Robots URL", metadata.robotsUrl);
      add("Crawl-delay", metadata.crawlDelay != null ? `${metadata.crawlDelay}s` : "Not set");
      if (Array.isArray(metadata.evaluations)) {
        for (const e of metadata.evaluations)
          rows.push({ label: e.userAgent, value: e.allowed ? "✓ Allowed" : "✕ Blocked", bool: e.allowed });
      }
      break;
    case "botAccessSimulation":
      add("Bots Checked", metadata.botsChecked);
      addList("Blocked", metadata.blockedBots);
      addList("Divergent", metadata.divergentBots);
      if (Array.isArray(metadata.simulations)) {
        for (const s of metadata.simulations) {
          const sim = s.comparisonToBrowser?.similarityScore;
          rows.push({
            label: s.botName,
            value: s.accessible ? `✓ OK${sim != null ? ` (sim: ${sim})` : ""}` : `✕ ${s.blocked ? "blocked" : "error"}`,
            bool: s.accessible,
          });
        }
      }
      break;
    case "llmsTxt":
      addList("Files Found", metadata.foundFiles);
      add("Primary File", metadata.primaryFile);
      add("File Size", metadata.fileSize ? `${metadata.fileSize} bytes` : null);
      if (metadata.parsed) {
        add("Title", metadata.parsed.title);
        add("Description", metadata.parsed.description);
        add("Sections", metadata.parsed.sectionCount);
        add("Links Listed", metadata.parsed.linkCount);
        addBool("Has Block Rules", metadata.parsed.hasBlockRules);
      }
      break;
    case "metaRobots":
      add("Tags Found", metadata.tagsFound);
      addList("Blocking Directives", metadata.blockingDirectivesFound);
      if (Array.isArray(metadata.details)) {
        for (const d of metadata.details) rows.push({ label: d.source, value: d.rawContent });
      }
      break;
    case "canonical":
      add("Canonical URL", metadata.canonicalUrl || "Not found");
      addBool("Self-referencing", metadata.isSelfReferencing);
      break;
    case "sitemap":
      add("Sitemap URL", metadata.sitemapUrl);
      addBool("URL in Sitemap", metadata.urlInSitemap);
      if (metadata.quality) {
        add("Total URLs", metadata.quality.urlCount?.toLocaleString());
        add("With lastmod", `${metadata.quality.pctWithLastmod}%`);
        add("Newest lastmod", metadata.quality.newestLastmod ? new Date(metadata.quality.newestLastmod).toLocaleDateString() : null);
        addBool("Exceeds 50k limit", metadata.quality.exceedsLimit ?? false);
      }
      addList("Quality Issues", metadata.qualityIssues);
      break;
    case "internalLinkDepth":
      add("Depth from Homepage", metadata.isHomepage ? "Homepage" : metadata.depth ?? "Unknown");
      add("Homepage Links Found", metadata.homepageLinkCount);
      add("Level 2 Pages Checked", metadata.level2PagesChecked);
      add("Level 3 Pages Checked", metadata.level3PagesChecked);
      break;
    case "structuredData":
      add("JSON-LD Blocks", metadata.totalBlocks);
      add("Parse Errors", metadata.parseErrors ?? 0);
      addList("Schema Types Found", metadata.schemaTypes);
      addList("Recognized Types", metadata.recognizedTypes);
      addList("Missing Fields", metadata.missingFields);
      addBool("Valid @context", metadata.hasValidContext);
      if (metadata.titleMismatch) rows.push({ label: "Title Mismatch", value: "Warning", bool: false });
      break;
    case "eeatSignals":
      add("Signals Found", `${metadata.foundCount} / ${metadata.totalSignals}`);
      add("Auth Citations", metadata.authoritativeLinkCount);
      addBool("Author Schema", metadata.hasAuthorSchema);
      addBool("Social Profiles", metadata.hasSocialProfiles);
      addBool("Org Schema", metadata.hasOrgSchema);
      addList("Found", metadata.foundSignals);
      addList("Missing", metadata.missingSignals);
      break;
    case "javascriptRendering":
      add("Rendering Mode", metadata.inferredRenderingMode);
      add("Script Tags", metadata.scriptTagCount);
      add("Render Dependency Score", metadata.renderDependencyScore);
      addBool("Playwright Available", metadata.playwrightAvailable);
      break;
    case "coreWebVitals":
      addBool("Measurements Available", metadata.available);
      if (metadata.metrics) {
        for (const [k, me] of Object.entries(metadata.metrics)) {
          rows.push({
            label: k.toUpperCase(),
            value: `${me.formatted} (${me.rating}) — ${me.threshold}`,
            bool: me.rating === "good" ? true : me.rating === "poor" ? false : undefined,
          });
        }
      }
      break;
    case "contentExtraction":
      add("Source", metadata.extractionSource);
      add("Word Count", metadata.extractedWordCount);
      add("Title", metadata.title);
      add("Meta Description", metadata.metaDescription);
      add("Text Sample", metadata.textSample);
      break;
    case "openGraph":
      addList("Present", metadata.present);
      addList("Missing", metadata.missing);
      if (metadata.fields) {
        for (const [prop, val] of Object.entries(metadata.fields))
          if (val) rows.push({ label: prop, value: String(val) });
      }
      break;
    case "contentFreshness":
      add("Content Type", metadata.contentModeLabel);
      add("Age", metadata.ageInDays != null ? `${metadata.ageInDays} days (${metadata.freshnessLabel})` : null);
      add("Best Signal", metadata.bestSignalSource);
      add("Date", metadata.bestSignalDate ? new Date(metadata.bestSignalDate).toLocaleDateString() : null);
      break;
    case "multiPageSample":
      add("Pages Sampled", metadata.pagesSampled);
      if (metadata.siteWideStats) {
        add("% With JSON-LD", `${metadata.siteWideStats.pctWithJsonLd}%`);
        add("% With Canonical", `${metadata.siteWideStats.pctWithSelfCanonical}%`);
        add("% Noindexed", `${metadata.siteWideStats.pctWithNoindex}%`);
        add("Error Pages", metadata.siteWideStats.errorPageCount);
        add("Missing Titles", metadata.siteWideStats.missingTitleCount);
      }
      addList("Issues Found", metadata.issues);
      break;
    default:
      for (const [k, v] of Object.entries(metadata)) {
        if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") add(k, v);
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
  node.classList.add(`card-${value.status.toLowerCase()}`);

  const pill = node.querySelector(".status-pill");
  pill.innerHTML = `<span class="pill-icon">${sm.icon}</span>${sm.label}`;
  pill.className = `status-pill ${sm.cls}`;
  node.querySelector(".check-reason").textContent = value.reason;

  // Inline metrics (always visible)
  const metricsHtml = buildMetricsHTML(key, value.metadata ?? {});
  if (metricsHtml) {
    const metricsEl = document.createElement("div");
    metricsEl.className = "check-metrics";
    metricsEl.innerHTML = metricsHtml;
    const toggle = node.querySelector(".details-toggle");
    node.insertBefore(metricsEl, toggle);
  }

  // Raw details toggle
  const toggle = node.querySelector(".details-toggle");
  const body   = node.querySelector(".details-body");
  const dl     = node.querySelector(".details-list");
  const rows   = buildDetailRows(key, value.metadata ?? {});

  if (rows.length === 0) {
    toggle.remove();
  } else {
    toggle.querySelector(".toggle-label").textContent = "Raw data";
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

function renderChecks(checks) {
  document.querySelectorAll(".checks-grid").forEach(g => g.replaceChildren());
  for (const [key, value] of Object.entries(checks)) {
    const cm = CHECK_META[key];
    if (cm) renderCheckCard(key, value, cm.grid);
  }
}

// ── Loading animation ─────────────────────────────────────
const LOADING_STEPS = [
  { text: "Fetching page…",                         lc: "lc-fetch"  },
  { text: "Checking DNS resolution & TLS cert…",    lc: "lc-fetch"  },
  { text: "Analysing redirect chain (301 vs 302)…", lc: "lc-fetch"  },
  { text: "Parsing robots.txt with wildcard spec…", lc: "lc-bots"   },
  { text: "Simulating 7 AI crawlers…",              lc: "lc-bots"   },
  { text: "Probing /llms.txt, /ai.txt…",            lc: "lc-bots"   },
  { text: "Checking meta robots & X-Robots-Tag…",   lc: "lc-crawl"  },
  { text: "Validating canonical tag…",              lc: "lc-crawl"  },
  { text: "Checking sitemap quality & lastmod %…",  lc: "lc-crawl"  },
  { text: "BFS crawl — measuring link depth…",      lc: "lc-crawl"  },
  { text: "Extracting & validating JSON-LD…",       lc: "lc-schema" },
  { text: "Evaluating 11 E-E-A-T signals…",         lc: "lc-schema" },
  { text: "Measuring JS rendering delta…",          lc: "lc-render" },
  { text: "Measuring Core Web Vitals via browser…", lc: "lc-render" },
  { text: "Extracting content, OG tags, freshness…",lc: "lc-content"},
  { text: "Sampling site-wide health (5 pages)…",  lc: "lc-site"   },
  { text: "Calculating GEO score…",                 lc: "lc-site"   },
];

let loadingInterval = null;
let loadingIndex = 0;
let completedSteps = [];

function startLoading() {
  loadingPanel.classList.remove("hidden");
  loadingIndex = 0;
  completedSteps = [];
  updateLoadingDisplay();

  loadingInterval = setInterval(() => {
    completedSteps.push(LOADING_STEPS[loadingIndex].text);
    loadingIndex = Math.min(loadingIndex + 1, LOADING_STEPS.length - 1);
    updateLoadingDisplay();
  }, 2000);
}

function updateLoadingDisplay() {
  const step = LOADING_STEPS[loadingIndex];
  loadingStep.textContent = step.text;

  document.querySelectorAll(".lc-item").forEach(el => el.classList.remove("lc-active", "lc-done"));

  // Mark completed categories
  const doneCategories = new Set(completedSteps.map((_, i) => LOADING_STEPS[i]?.lc).filter(Boolean));
  doneCategories.forEach(lcId => {
    const el = document.getElementById(lcId);
    if (el && lcId !== step.lc) el.classList.add("lc-done");
  });

  // Mark current
  document.getElementById(step.lc)?.classList.add("lc-active");

  // Update log
  const logEl = document.getElementById("loading-log");
  if (logEl) {
    const items = completedSteps.slice(-6).map(s =>
      `<div class="log-item log-done">✓ ${esc(s)}</div>`
    ).join("");
    logEl.innerHTML = items + `<div class="log-item log-current">&rsaquo; ${esc(step.text)}</div>`;
    logEl.scrollTop = logEl.scrollHeight;
  }
}

function stopLoading() {
  clearInterval(loadingInterval);
  loadingPanel.classList.add("hidden");
  document.querySelectorAll(".lc-item").forEach(el => el.classList.remove("lc-active", "lc-done"));
}

function showResultPanels() {
  [statusPanel, checksPanel, jsonPanel].forEach(p => {
    p.classList.remove("hidden");
    p.style.animation = "none";
    void p.offsetHeight;
    p.style.animation = "";
  });
}

function renderReport(payload) {
  const { report, score, classification, moduleBreakdown } = payload;

  scoreBadge.style.setProperty("--pct", String(score));
  scoreBadge.style.setProperty("--score-color", scoreColor(score));
  scoreValue.textContent = String(score);

  const cm = CLASSIFICATION_META[classification] ?? { color: "var(--text)" };
  const icons = { Excellent: "✓", Good: "✓", Risky: "⚠", Broken: "✕" };
  resultTitle.innerHTML = `<span class="classification-icon">${icons[classification] ?? ""}</span> ${classification}`;
  resultTitle.style.color = cm.color;

  const checkedAt = new Date(report.checkedAt ?? Date.now()).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  resultSummary.innerHTML = `<span class="summary-url">${esc(report.url)}</span><span class="summary-sep">·</span>${checkedAt}`;

  renderRadar(moduleBreakdown);
  renderBar(report.checks);
  renderStats(report.checks);
  renderChecks(report.checks);

  jsonOutput.textContent = JSON.stringify(payload, null, 2);
  showResultPanels();
}

function renderError(message) {
  scoreBadge.style.setProperty("--pct", "0");
  scoreBadge.style.setProperty("--score-color", FAIL_CLR);
  scoreValue.textContent = "—";
  resultTitle.innerHTML = `<span class="classification-icon">✕</span> Failed`;
  resultTitle.style.color = FAIL_CLR;
  resultSummary.innerHTML = `<span class="summary-url">${esc(message)}</span>`;
  statRow.innerHTML = "";
  document.querySelectorAll(".checks-grid").forEach(g => g.replaceChildren());
  jsonOutput.textContent = "";
  showResultPanels();
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
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
