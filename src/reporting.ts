import type { CrawlabilityReport } from "./types.js";

export function formatSummary(report: CrawlabilityReport): string {
  const pad = (s: string, n = 24) => s.padEnd(n);
  const lines = [
    `GEO & AI Crawlability Audit — v3`,
    `URL:      ${report.url}`,
    `Checked:  ${report.checkedAt}`,
    `Score:    ${report.score}/100 (${report.classification})`,
    "",
    "FETCHABILITY",
    `  ${pad("Fetchability")} ${report.checks.fetchability.status} — ${report.checks.fetchability.reason}`,
    "",
    "BOT ACCESS",
    `  ${pad("Robots.txt")} ${report.checks.robotsTxt.status} — ${report.checks.robotsTxt.reason}`,
    `  ${pad("Bot Simulation (7)")} ${report.checks.botAccessSimulation.status} — ${report.checks.botAccessSimulation.reason}`,
    `  ${pad("llms.txt / ai.txt")} ${report.checks.llmsTxt.status} — ${report.checks.llmsTxt.reason}`,
    "",
    "CRAWL SIGNALS",
    `  ${pad("Meta Robots")} ${report.checks.metaRobots.status} — ${report.checks.metaRobots.reason}`,
    `  ${pad("Canonical Tag")} ${report.checks.canonical.status} — ${report.checks.canonical.reason}`,
    `  ${pad("Sitemap")} ${report.checks.sitemap.status} — ${report.checks.sitemap.reason}`,
    `  ${pad("Internal Link Depth")} ${report.checks.internalLinkDepth.status} — ${report.checks.internalLinkDepth.reason}`,
    "",
    "STRUCTURED DATA & AUTHORITY",
    `  ${pad("Structured Data")} ${report.checks.structuredData.status} — ${report.checks.structuredData.reason}`,
    `  ${pad("E-E-A-T Signals")} ${report.checks.eeatSignals.status} — ${report.checks.eeatSignals.reason}`,
    "",
    "RENDERING & PERFORMANCE",
    `  ${pad("JS Rendering")} ${report.checks.javascriptRendering.status} — ${report.checks.javascriptRendering.reason}`,
    `  ${pad("Core Web Vitals")} ${report.checks.coreWebVitals.status} — ${report.checks.coreWebVitals.reason}`,
    "",
    "CONTENT QUALITY",
    `  ${pad("Content Extraction")} ${report.checks.contentExtraction.status} — ${report.checks.contentExtraction.reason}`,
    `  ${pad("Open Graph")} ${report.checks.openGraph.status} — ${report.checks.openGraph.reason}`,
    `  ${pad("Content Freshness")} ${report.checks.contentFreshness.status} — ${report.checks.contentFreshness.reason}`,
    "",
    "SITE HEALTH",
    `  ${pad("Multi-Page Sample")} ${report.checks.multiPageSample.status} — ${report.checks.multiPageSample.reason}`,
  ];
  return lines.join("\n");
}
