import type { BotSimulationResult, CheckContext, CheckResult } from "../types.js";
import { fetchText } from "../utils/http.js";

const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36";

const BOT_USER_AGENTS: Array<{ name: string; ua: string }> = [
  { name: "GPTBot", ua: "GPTBot/1.0" },
  {
    name: "ClaudeBot",
    ua: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/0.1; +claude.ai/bot)",
  },
  {
    name: "PerplexityBot",
    ua: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)",
  },
  {
    name: "Googlebot",
    ua: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  },
  {
    name: "Bingbot",
    ua: "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
  },
  {
    name: "Applebot",
    ua: "Mozilla/5.0 (compatible; Applebot/0.1; +http://www.apple.com/go/applebot)",
  },
  {
    name: "Meta-ExternalAgent",
    ua: "meta-externalagent/1.1 (+https://developers.facebook.com/docs/sharing/bot/)",
  },
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

function wordTokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/<[^>]+>/g, " ")
      .split(/\W+/)
      .filter((t) => t.length > 3),
  );
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  const intersection = [...a].filter((t) => b.has(t)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 1 : Number((intersection / union).toFixed(2));
}

export async function runBotAccessSimulationCheck(
  context: CheckContext,
): Promise<CheckResult> {
  const url = context.normalizedUrl.toString();

  const browserSnapshot = await fetchText(url, {
    headers: { "user-agent": BROWSER_USER_AGENT },
  });

  const browserTokens = wordTokens(browserSnapshot.body ?? "");
  const browserResponseLength = browserSnapshot.body?.length ?? 0;
  const results: BotSimulationResult[] = [];

  for (const { name, ua } of BOT_USER_AGENTS) {
    const snapshot = await fetchText(url, { headers: { "user-agent": ua } });

    const blocked = snapshot.fetchError ? true : isBlocked(snapshot);
    const accessible =
      !snapshot.fetchError && !blocked && (snapshot.statusCode ?? 500) < 400;

    const responseLength = snapshot.body?.length ?? 0;
    const responseLengthDelta = responseLength - browserResponseLength;
    const responseLengthDeltaPercent =
      browserResponseLength === 0
        ? responseLength === 0 ? 0 : 100
        : Number(((Math.abs(responseLengthDelta) / browserResponseLength) * 100).toFixed(2));

    const differentStatusCode = snapshot.statusCode !== browserSnapshot.statusCode;
    const botTokens = wordTokens(snapshot.body ?? "");
    const similarityScore = jaccardSimilarity(browserTokens, botTokens);
    const contentDiverged = similarityScore < 0.6 && responseLength > 200;
    const differentFromBrowser = differentStatusCode || contentDiverged;

    results.push({
      botName: name,
      userAgent: ua,
      statusCode: snapshot.statusCode,
      accessible,
      blocked,
      responseLength,
      reason: snapshot.fetchError
        ? snapshot.fetchError
        : blocked
          ? `Blocked — HTTP ${snapshot.statusCode}`
          : differentFromBrowser
            ? `Divergent response (similarity: ${similarityScore})`
            : "Accessible — matches browser baseline",
      comparisonToBrowser: {
        differentStatusCode,
        responseLengthDelta,
        responseLengthDeltaPercent,
        similarityScore,
      },
    });
  }

  const blockedResults = results.filter((r) => !r.accessible);
  const divergentResults = results.filter(
    (r) =>
      r.accessible &&
      r.comparisonToBrowser &&
      (r.comparisonToBrowser.differentStatusCode || r.comparisonToBrowser.similarityScore < 0.6),
  );

  const blockedNames = blockedResults.map((r) => r.botName);
  const divergentNames = divergentResults.map((r) => r.botName);
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
        ? `All ${results.length} AI crawlers appear blocked`
        : blockedResults.length > 0
          ? `Blocked for: ${blockedNames.join(", ")}`
          : divergentResults.length > 0
            ? `Divergent response for: ${divergentNames.join(", ")}`
            : `All ${results.length} AI crawlers received an accessible response`,
    metadata: {
      normalizedScore: status === "PASS" ? 1 : status === "WARNING" ? 0.5 : 0,
      browserBaseline: {
        statusCode: browserSnapshot.statusCode,
        responseLength: browserResponseLength,
        finalUrl: browserSnapshot.finalUrl,
      },
      botsChecked: results.length,
      blockedBots: blockedNames,
      divergentBots: divergentNames,
      simulations: results,
    },
  };
}
