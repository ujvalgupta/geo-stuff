import type {
  CheckResult,
  CheckStatus,
  CrawlabilityClassification,
  ScoreBreakdown,
} from "./types.js";

const CATEGORY_WEIGHTS = {
  fetchability: 12,
  botAccess: 18,
  crawlSignals: 20,
  structuredData: 25,
  rendering: 12,
  contentQuality: 13,
} as const;

function getNormalizedScore(result: CheckResult): number {
  const raw = result.metadata["normalizedScore"];
  if (typeof raw === "number") return Math.max(0, Math.min(1, raw));
  const map: Record<CheckStatus, number> = { PASS: 1, WARNING: 0.5, FAIL: 0 };
  return map[result.status] ?? 0;
}

export function calculateScore(results: {
  fetchability: CheckResult;
  robotsTxt: CheckResult;
  botAccessSimulation: CheckResult;
  metaRobots: CheckResult;
  canonical: CheckResult;
  sitemap: CheckResult;
  structuredData: CheckResult;
  javascriptRendering: CheckResult;
  contentExtraction: CheckResult;
  openGraph: CheckResult;
  contentFreshness: CheckResult;
}): { score: number; breakdown: ScoreBreakdown } {
  const breakdown: ScoreBreakdown = {
    // Fetchability — single check
    fetchability: getNormalizedScore(results.fetchability),

    // Bot Access — average of robots.txt + bot simulation
    botAccess:
      (getNormalizedScore(results.robotsTxt) +
        getNormalizedScore(results.botAccessSimulation)) /
      2,

    // Crawl Signals — average of meta robots + canonical + sitemap
    crawlSignals:
      (getNormalizedScore(results.metaRobots) +
        getNormalizedScore(results.canonical) +
        getNormalizedScore(results.sitemap)) /
      3,

    // Structured Data — single check, highest weight
    structuredData: getNormalizedScore(results.structuredData),

    // Rendering — single check
    rendering: getNormalizedScore(results.javascriptRendering),

    // Content Quality — average of extraction + open graph + freshness
    contentQuality:
      (getNormalizedScore(results.contentExtraction) +
        getNormalizedScore(results.openGraph) +
        getNormalizedScore(results.contentFreshness)) /
      3,
  };

  const totalWeight = Object.values(CATEGORY_WEIGHTS).reduce((s, w) => s + w, 0);
  const weighted = (Object.keys(CATEGORY_WEIGHTS) as Array<keyof typeof CATEGORY_WEIGHTS>).reduce(
    (sum, key) => sum + breakdown[key] * CATEGORY_WEIGHTS[key],
    0,
  );

  return {
    score: Math.round((weighted / totalWeight) * 100),
    breakdown,
  };
}

export function classifyScore(score: number): CrawlabilityClassification {
  if (score >= 80) return "Excellent";
  if (score >= 60) return "Good";
  if (score >= 40) return "Risky";
  return "Broken";
}

export function inferOverallStatus(score: number): CheckStatus {
  const c = classifyScore(score);
  if (c === "Excellent" || c === "Good") return "PASS";
  if (c === "Risky") return "WARNING";
  return "FAIL";
}
