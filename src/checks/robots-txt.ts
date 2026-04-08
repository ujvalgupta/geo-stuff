import type { CheckContext, CheckResult } from "../types.js";
import { fetchText, getOriginRobotsUrl } from "../utils/http.js";
import { evaluateRobotsAccess, parseCrawlDelay } from "../utils/robots.js";

const TARGET_BOTS = [
  "GPTBot",
  "ClaudeBot",
  "PerplexityBot",
  "Googlebot",
  "Bingbot",
  "Applebot",
  "Meta-ExternalAgent",
];

const AGGRESSIVE_CRAWL_DELAY_SECONDS = 300; // 5 minutes — flag as problematic

export async function runRobotsTxtCheck(
  context: CheckContext,
): Promise<CheckResult> {
  const robotsUrl = getOriginRobotsUrl(context.normalizedUrl);
  const snapshot = await fetchText(robotsUrl);

  if (snapshot.fetchError) {
    return {
      status: "WARNING",
      reason: "robots.txt could not be fetched",
      metadata: { normalizedScore: 0.5, robotsUrl, fetchError: snapshot.fetchError },
    };
  }

  if (snapshot.statusCode === 404) {
    return {
      status: "PASS",
      reason: "No robots.txt found — no crawler restrictions declared",
      metadata: { normalizedScore: 1, robotsUrl, statusCode: 404 },
    };
  }

  const body = snapshot.body ?? "";
  const path = `${context.normalizedUrl.pathname}${context.normalizedUrl.search}`;

  const evaluations = TARGET_BOTS.map((bot) => {
    const evaluation = evaluateRobotsAccess(body, bot, path);
    return {
      userAgent: bot,
      allowed: evaluation.allowed,
      matchedRule: evaluation.matchedRule ?? null,
    };
  });

  const crawlDelay = parseCrawlDelay(body);
  const crawlDelayProblematic =
    crawlDelay !== null && crawlDelay >= AGGRESSIVE_CRAWL_DELAY_SECONDS;

  const blockedBots = evaluations.filter((e) => !e.allowed);

  let status: "PASS" | "WARNING" | "FAIL";
  let reason: string;

  if (blockedBots.length === TARGET_BOTS.length) {
    status = "FAIL";
    reason = "robots.txt blocks all tested AI crawlers";
  } else if (blockedBots.length > 0) {
    status = "FAIL";
    reason = `robots.txt blocks: ${blockedBots.map((b) => b.userAgent).join(", ")}`;
  } else if (crawlDelayProblematic) {
    status = "WARNING";
    reason = `All bots allowed but Crawl-delay is ${crawlDelay}s — AI crawlers may index very infrequently`;
  } else {
    status = "PASS";
    reason = "robots.txt allows all tested AI crawlers";
  }

  return {
    status,
    reason,
    metadata: {
      normalizedScore: status === "PASS" ? 1 : status === "WARNING" ? 0.7 : 0,
      robotsUrl,
      statusCode: snapshot.statusCode,
      evaluations,
      crawlDelay,
      crawlDelayProblematic,
    },
  };
}
