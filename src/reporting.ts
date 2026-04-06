import type { CrawlabilityReport } from "./types.js";

export function formatSummary(report: CrawlabilityReport): string {
  const lines = [
    `AI Crawlability Checker`,
    `URL: ${report.url}`,
    `Checked At: ${report.checkedAt}`,
    `Overall: ${report.classification} (${report.score}/100)`,
    "",
    `Checks:`,
    `- Fetchability: ${report.checks.fetchability.status} - ${report.checks.fetchability.reason}`,
    `- Robots.txt: ${report.checks.robotsTxt.status} - ${report.checks.robotsTxt.reason}`,
    `- Bot Access Simulation: ${report.checks.botAccessSimulation.status} - ${report.checks.botAccessSimulation.reason}`,
    `- JavaScript Rendering: ${report.checks.javascriptRendering.status} - ${report.checks.javascriptRendering.reason}`,
    `- HTML Parsability: ${report.checks.htmlParsability.status} - ${report.checks.htmlParsability.reason}`,
    `- Content Extraction: ${report.checks.contentExtraction.status} - ${report.checks.contentExtraction.reason}`,
  ];

  return lines.join("\n");
}
