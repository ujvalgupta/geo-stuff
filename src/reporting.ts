import type { CrawlabilityReport } from "./types.js";

export function formatSummary(report: CrawlabilityReport): string {
  const lines = [
    `GEO & AI Crawlability Audit`,
    `URL: ${report.url}`,
    `Checked At: ${report.checkedAt}`,
    `Overall: ${report.classification} (${report.score}/100)`,
    "",
    `Checks:`,
    `- Fetchability:         ${report.checks.fetchability.status} — ${report.checks.fetchability.reason}`,
    `- Robots.txt:           ${report.checks.robotsTxt.status} — ${report.checks.robotsTxt.reason}`,
    `- Bot Simulation (7):   ${report.checks.botAccessSimulation.status} — ${report.checks.botAccessSimulation.reason}`,
    `- Meta Robots:          ${report.checks.metaRobots.status} — ${report.checks.metaRobots.reason}`,
    `- Canonical Tag:        ${report.checks.canonical.status} — ${report.checks.canonical.reason}`,
    `- Sitemap:              ${report.checks.sitemap.status} — ${report.checks.sitemap.reason}`,
    `- Structured Data:      ${report.checks.structuredData.status} — ${report.checks.structuredData.reason}`,
    `- JS Rendering:         ${report.checks.javascriptRendering.status} — ${report.checks.javascriptRendering.reason}`,
    `- Content Extraction:   ${report.checks.contentExtraction.status} — ${report.checks.contentExtraction.reason}`,
    `- Open Graph:           ${report.checks.openGraph.status} — ${report.checks.openGraph.reason}`,
    `- Content Freshness:    ${report.checks.contentFreshness.status} — ${report.checks.contentFreshness.reason}`,
  ];

  return lines.join("\n");
}
