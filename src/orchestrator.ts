import { runBotAccessSimulationCheck } from "./checks/bot-access-simulation.js";
import { runCanonicalCheck } from "./checks/canonical.js";
import { runContentExtractionCheck } from "./checks/content-extraction.js";
import { runContentFreshnessCheck } from "./checks/content-freshness.js";
import { runCoreWebVitalsCheck } from "./checks/core-web-vitals.js";
import { runEeatSignalsCheck } from "./checks/eeat-signals.js";
import { runFetchabilityCheck } from "./checks/fetchability.js";
import { runInternalLinkDepthCheck } from "./checks/internal-link-depth.js";
import { runJavascriptRenderingCheck } from "./checks/javascript-rendering.js";
import { runLlmsTxtCheck } from "./checks/llms-txt.js";
import { runMetaRobotsCheck } from "./checks/meta-robots.js";
import { runMultiPageSampleCheck } from "./checks/multi-page-sample.js";
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

  // Fetchability must run first — it populates context.baseSnapshot
  const { result: fetchability, snapshot } = await runFetchabilityCheck(context);
  context.baseSnapshot = snapshot;

  // All remaining checks run in parallel
  const [
    robotsTxt,
    botAccessSimulation,
    llmsTxt,
    metaRobots,
    canonical,
    sitemap,
    internalLinkDepth,
    structuredData,
    eeatSignals,
    javascriptRendering,
    coreWebVitals,
    contentExtraction,
    openGraph,
    contentFreshness,
    multiPageSample,
  ] = await Promise.all([
    runRobotsTxtCheck(context),
    runBotAccessSimulationCheck(context),
    runLlmsTxtCheck(context),
    runMetaRobotsCheck(context),
    runCanonicalCheck(context),
    runSitemapCheck(context),
    runInternalLinkDepthCheck(context),
    runStructuredDataCheck(context),
    runEeatSignalsCheck(context),
    runJavascriptRenderingCheck(context),
    runCoreWebVitalsCheck(context),
    runContentExtractionCheck(context),
    runOpenGraphCheck(context),
    runContentFreshnessCheck(context),
    runMultiPageSampleCheck(context),
  ]);

  const checks = {
    fetchability,
    robotsTxt,
    botAccessSimulation,
    llmsTxt,
    metaRobots,
    canonical,
    sitemap,
    internalLinkDepth,
    structuredData,
    eeatSignals,
    javascriptRendering,
    coreWebVitals,
    contentExtraction,
    openGraph,
    contentFreshness,
    multiPageSample,
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
