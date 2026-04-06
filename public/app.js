const form = document.querySelector("#analyze-form");
const urlInput = document.querySelector("#url-input");
const submitButton = document.querySelector("#submit-button");
const statusPanel = document.querySelector("#status-panel");
const checksPanel = document.querySelector("#checks-panel");
const jsonPanel = document.querySelector("#json-panel");
const resultTitle = document.querySelector("#result-title");
const resultSummary = document.querySelector("#result-summary");
const scoreValue = document.querySelector("#score-value");
const breakdownGrid = document.querySelector("#breakdown-grid");
const checksGrid = document.querySelector("#checks-grid");
const jsonOutput = document.querySelector("#json-output");
const metricCardTemplate = document.querySelector("#metric-card-template");
const checkCardTemplate = document.querySelector("#check-card-template");

const checkLabels = {
  fetchability: "Fetchability",
  robotsTxt: "Robots.txt",
  botAccessSimulation: "Bot Access",
  javascriptRendering: "Rendering",
  htmlParsability: "Parsing",
  contentExtraction: "Content Quality",
};

const breakdownLabels = {
  fetchability: "Fetchability",
  botAccess: "Bot Access",
  rendering: "Rendering",
  parsing: "Parsing",
  contentQuality: "Content Quality",
};

function statusClass(status) {
  return status === "PASS"
    ? "status-pass"
    : status === "WARNING"
      ? "status-warning"
      : "status-fail";
}

function showPanels() {
  statusPanel.classList.remove("hidden");
  checksPanel.classList.remove("hidden");
  jsonPanel.classList.remove("hidden");
}

function renderBreakdown(moduleBreakdown) {
  breakdownGrid.replaceChildren();

  Object.entries(moduleBreakdown).forEach(([key, value]) => {
    const node = metricCardTemplate.content.firstElementChild.cloneNode(true);
    node.querySelector(".metric-label").textContent = breakdownLabels[key] ?? key;
    node.querySelector(".metric-value").textContent = `${Math.round(value * 100)}%`;
    breakdownGrid.appendChild(node);
  });
}

function renderChecks(checks) {
  checksGrid.replaceChildren();

  Object.entries(checks).forEach(([key, value]) => {
    const node = checkCardTemplate.content.firstElementChild.cloneNode(true);
    node.querySelector(".check-title").textContent = checkLabels[key] ?? key;

    const pill = node.querySelector(".status-pill");
    pill.textContent = value.status;
    pill.className = `status-pill ${statusClass(value.status)}`;

    node.querySelector(".check-reason").textContent = value.reason;
    checksGrid.appendChild(node);
  });
}

function renderReport(payload) {
  const { report, score, classification, moduleBreakdown } = payload;
  resultTitle.textContent = classification;
  resultSummary.textContent = report.summary;
  scoreValue.textContent = String(score);
  renderBreakdown(moduleBreakdown);
  renderChecks(report.checks);
  jsonOutput.textContent = JSON.stringify(payload, null, 2);
  showPanels();
}

function renderError(message) {
  resultTitle.textContent = "Request failed";
  resultSummary.textContent = message;
  scoreValue.textContent = "0";
  breakdownGrid.replaceChildren();
  checksGrid.replaceChildren();
  jsonOutput.textContent = "";
  showPanels();
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  submitButton.disabled = true;
  submitButton.textContent = "Analyzing...";

  try {
    const response = await fetch("/analyze", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        url: urlInput.value.trim(),
      }),
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.message ?? "Analysis failed");
    }

    renderReport(payload);
  } catch (error) {
    renderError(error instanceof Error ? error.message : String(error));
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Analyze";
  }
});
