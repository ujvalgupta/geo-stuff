import { runBotAccessSimulationCheck } from "./checks/bot-access-simulation.js";
import { runCanonicalCheck } from "./checks/canonical.js";
import { runContentExtractionCheck } from "./checks/content-extraction.js";
import { runContentFreshnessCheck } from "./checks/content-freshness.js";
import { runFetchabilityCheck } from "./checks/fetchability.js";
import { runJavascriptRenderingCheck } from "./checks/javascript-rendering.js";
import { runMetaRobotsCheck } from "./checks/meta-robots.js";
import { runOpenGraphCheck } from "./checks/open-graph.js";
import { runRobotsTxtCheck } from "./checks/robots-txt.js";
import { runSitemapCheck } from "./checks/sitemap.js";
import { runStructuredDataCheck } from "./checks/structured-data.js";
import { formatSummary } from "./reporting.js";
import { calculateScore, classifyScore, inferOverallStatus } from "./scoring.js";
import type { CheckContext, CrawlabilityReport } from "./types.js";

export async function runCrawlabilityCheck(inputUrl: string): Promise<CrawlabilityReport> {
  const normalizedUrl = new URL(inputUrl);
  const context: CheckContext = { inputUrl, normalizedUrl };

  // Fetchability must run first — it populates context.baseSnapshot for all subsequent checks
  const { result: fetchability, snapshot } = await runFetchabilityCheck(context);
  context.baseSnapshot = snapshot;

  // All remaining checks run in parallel
  const [
    robotsTxt,
    botAccessSimulation,
    metaRobots,
    canonical,
    sitemap,
    structuredData,
    javascriptRendering,
    contentExtraction,
    openGraph,
    contentFreshness,
  ] = await Promise.all([
    runRobotsTxtCheck(context),
    runBotAccessSimulationCheck(context),
    runMetaRobotsCheck(context),
    runCanonicalCheck(context),
    runSitemapCheck(context),
    runStructuredDataCheck(context),
    runJavascriptRenderingCheck(context),
    runContentExtractionCheck(context),
    runOpenGraphCheck(context),
    runContentFreshnessCheck(context),
  ]);

  const checks = {
    fetchability,
    robotsTxt,
    botAccessSimulation,
    metaRobots,
    canonical,
    sitemap,
    structuredData,
    javascriptRendering,
    contentExtraction,
    openGraph,
    contentFreshness,
  };

  const { score, breakdown } = calculateScore(checks);
  const classification = classifyScore(score);
  const overallStatus = inferOverallStatus(score);

  const report: CrawlabilityReport = {
    url: normalizedUrl.toString(),
    checkedAt: new Date().toISOString(),
    score,
    overallStatus,
    classification,
    breakdown,
    checks,
    summary: "",
  };

  report.summary = formatSummary(report);
  return report;
}
