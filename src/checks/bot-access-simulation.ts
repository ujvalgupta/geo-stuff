import type { BotSimulationResult, CheckContext, CheckResult } from "../types.js";
import { fetchText } from "../utils/http.js";

const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36";

const USER_AGENTS = [
  "GPTBot/1.0",
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  "PerplexityBot/1.0",
];

function isBlocked(snapshot: Awaited<ReturnType<typeof fetchText>>): boolean {
  const body = snapshot.body?.toLowerCase() ?? "";
  return (
    snapshot.statusCode === 401 ||
    snapshot.statusCode === 403 ||
    snapshot.statusCode === 429 ||
    body.includes("access denied") ||
    body.includes("forbidden") ||
    body.includes("captcha") ||
    body.includes("blocked")
  );
}

function normalizeHtml(html: string | null): string {
  return (html ?? "").replace(/\s+/g, " ").trim();
}

function calculateSimilarityScore(left: string, right: string): number {
  if (!left && !right) {
    return 1;
  }

  const leftTokens = new Set(left.toLowerCase().split(/\W+/).filter(Boolean));
  const rightTokens = new Set(right.toLowerCase().split(/\W+/).filter(Boolean));
  const union = new Set([...leftTokens, ...rightTokens]);
  if (union.size === 0) {
    return 1;
  }

  let intersectionCount = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      intersectionCount += 1;
    }
  }

  return Number((intersectionCount / union.size).toFixed(2));
}

export async function runBotAccessSimulationCheck(
  context: CheckContext,
): Promise<CheckResult> {
  const browserSnapshot = await fetchText(context.normalizedUrl.toString(), {
    headers: {
      "user-agent": BROWSER_USER_AGENT,
    },
  });
  const browserHtml = normalizeHtml(browserSnapshot.body);
  const browserResponseLength = browserSnapshot.body?.length ?? 0;
  const results: BotSimulationResult[] = [];

  for (const userAgent of USER_AGENTS) {
    const snapshot = await fetchText(context.normalizedUrl.toString(), {
      headers: {
        "user-agent": userAgent,
      },
    });

    const blocked = snapshot.fetchError ? true : isBlocked(snapshot);
    const accessible = !snapshot.fetchError && !blocked && (snapshot.statusCode ?? 500) < 400;
    const normalizedBotHtml = normalizeHtml(snapshot.body);
    const responseLength = snapshot.body?.length ?? 0;
    const responseLengthDelta = responseLength - browserResponseLength;
    const responseLengthDeltaPercent = browserResponseLength === 0
      ? responseLength === 0
        ? 0
        : 100
      : Number(((Math.abs(responseLengthDelta) / browserResponseLength) * 100).toFixed(2));
    const differentStatusCode =
      snapshot.statusCode !== browserSnapshot.statusCode;
    const htmlDifferent = normalizedBotHtml !== browserHtml;
    const similarityScore = calculateSimilarityScore(browserHtml, normalizedBotHtml);
    const differentFromBrowser =
      differentStatusCode || responseLengthDeltaPercent >= 20 || htmlDifferent;

    results.push({
      userAgent,
      statusCode: snapshot.statusCode,
      accessible,
      blocked,
      responseLength,
      reason: snapshot.fetchError
        ? snapshot.fetchError
        : blocked
          ? `Possible bot blocking with HTTP ${snapshot.statusCode}`
          : differentFromBrowser
            ? "Bot user agent received a materially different response than the browser baseline"
          : "Bot user agent received an accessible response",
      comparisonToBrowser: {
        differentStatusCode,
        responseLengthDelta,
        responseLengthDeltaPercent,
        htmlDifferent,
        similarityScore,
      },
    });
  }

  const blockedResults = results.filter((item) => !item.accessible);
  const divergentResults = results.filter((item) => {
    const comparison = item.comparisonToBrowser;
    return comparison
      ? comparison.differentStatusCode ||
          comparison.responseLengthDeltaPercent >= 20 ||
          comparison.htmlDifferent
      : false;
  });

  const status =
    blockedResults.length === results.length
      ? "FAIL"
      : blockedResults.length > 0 || divergentResults.length > 0
        ? "WARNING"
      : "PASS";

  return {
    status,
    reason:
      blockedResults.length === results.length
        ? "All simulated crawler user agents appear blocked or degraded"
        : blockedResults.length > 0
          ? "Some crawler user agents appear blocked or degraded"
          : divergentResults.length > 0
            ? "Bots received responses that differ from the normal browser baseline"
            : "All simulated crawler user agents matched the browser baseline closely",
    metadata: {
      normalizedScore: status === "PASS" ? 1 : status === "WARNING" ? 0.5 : 0,
      browserBaseline: {
        userAgent: BROWSER_USER_AGENT,
        statusCode: browserSnapshot.statusCode,
        responseLength: browserResponseLength,
        finalUrl: browserSnapshot.finalUrl,
      },
      simulations: results,
      divergentBots: divergentResults.map((item) => item.userAgent),
    },
  };
}
