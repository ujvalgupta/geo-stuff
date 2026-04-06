import { runBotAccessSimulationCheck } from "./checks/bot-access-simulation.ts";
import { runContentExtractionCheck } from "./checks/content-extraction.ts";
import { runFetchabilityCheck } from "./checks/fetchability.ts";
import { runHtmlParsabilityCheck } from "./checks/html-parsability.ts";
import { runJavascriptRenderingCheck } from "./checks/javascript-rendering.ts";
import { runRobotsTxtCheck } from "./checks/robots-txt.ts";
import { formatSummary } from "./reporting.ts";
import { calculateScore, classifyScore, inferOverallStatus } from "./scoring.ts";
import type { CheckContext, CrawlabilityReport } from "./types.ts";

export async function runCrawlabilityCheck(inputUrl: string): Promise<CrawlabilityReport> {
  const normalizedUrl = new URL(inputUrl);
  const context: CheckContext = {
    inputUrl,
    normalizedUrl,
  };

  const { result: fetchability, snapshot } = await runFetchabilityCheck(context);
  context.baseSnapshot = snapshot;

  const [robotsTxt, botAccessSimulation, javascriptRendering, htmlParsability, contentExtraction] =
    await Promise.all([
      runRobotsTxtCheck(context),
      runBotAccessSimulationCheck(context),
      runJavascriptRenderingCheck(context),
      runHtmlParsabilityCheck(context),
      runContentExtractionCheck(context),
    ]);

  const checks = {
    fetchability,
    robotsTxt,
    botAccessSimulation,
    javascriptRendering,
    htmlParsability,
    contentExtraction,
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

  report.checks.fetchability.metadata.weight = 20;
  report.checks.robotsTxt.metadata.weight = 12.5;
  report.checks.botAccessSimulation.metadata.weight = 12.5;
  report.checks.javascriptRendering.metadata.weight = 20;
  report.checks.htmlParsability.metadata.weight = 15;
  report.checks.contentExtraction.metadata.weight = 20;
  report.checks.fetchability.metadata.categoryScore = breakdown.fetchability;
  report.checks.robotsTxt.metadata.categoryScore = breakdown.botAccess;
  report.checks.botAccessSimulation.metadata.categoryScore = breakdown.botAccess;
  report.checks.javascriptRendering.metadata.categoryScore = breakdown.rendering;
  report.checks.htmlParsability.metadata.categoryScore = breakdown.parsing;
  report.checks.contentExtraction.metadata.categoryScore = breakdown.contentQuality;

  report.summary = formatSummary(report);
  return report;
}
