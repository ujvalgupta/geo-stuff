import type { CheckContext, CheckResult } from "../types.js";
import { fetchText, getOriginRobotsUrl } from "../utils/http.js";
import { evaluateRobotsAccess } from "../utils/robots.js";

const TARGET_BOTS = ["GPTBot", "Googlebot", "PerplexityBot"];

export async function runRobotsTxtCheck(
  context: CheckContext,
): Promise<CheckResult> {
  const robotsUrl = getOriginRobotsUrl(context.normalizedUrl);
  const snapshot = await fetchText(robotsUrl);

  if (snapshot.fetchError) {
    return {
      status: "WARNING",
      reason: "robots.txt could not be fetched",
      metadata: {
        normalizedScore: 0.5,
        robotsUrl,
        fetchError: snapshot.fetchError,
      },
    };
  }

  if (snapshot.statusCode === 404) {
    return {
      status: "PASS",
      reason: "robots.txt not found, so no crawler restrictions were declared",
      metadata: {
        normalizedScore: 1,
        robotsUrl,
        statusCode: snapshot.statusCode,
      },
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

  const blockedBots = evaluations.filter((item) => !item.allowed);
  return {
    status: blockedBots.length > 0 ? "FAIL" : "PASS",
    reason:
      blockedBots.length > 0
        ? `robots.txt blocks ${blockedBots.map((bot) => bot.userAgent).join(", ")}`
        : "robots.txt allows the tested crawler user agents",
    metadata: {
      normalizedScore: blockedBots.length > 0 ? 0 : 1,
      robotsUrl,
      statusCode: snapshot.statusCode,
      evaluations,
    },
  };
}
