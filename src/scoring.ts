import type {
  CheckResult,
  CheckStatus,
  CrawlabilityClassification,
  ScoreBreakdown,
} from "./types.js";

const CATEGORY_WEIGHTS = {
  fetchability:   10,
  botAccess:      15,
  crawlSignals:   18,
  structuredData: 20,
  rendering:      10,
  contentQuality: 15,
  siteHealth:     12,
} as const;

function getNormalizedScore(result: CheckResult): number {
  const raw = result.metadata["normalizedScore"];
  if (typeof raw === "number") return Math.max(0, Math.min(1, raw));
  const map: Record<CheckStatus, number> = { PASS: 1, WARNING: 0.5, FAIL: 0 };
  return map[result.status] ?? 0;
}

function avg(...scores: number[]): number {
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

export function calculateScore(results: {
  fetchability: CheckResult;
  robotsTxt: CheckResult;
  botAccessSimulation: CheckResult;
  llmsTxt: CheckResult;
  metaRobots: CheckResult;
  canonical: CheckResult;
  sitemap: CheckResult;
  internalLinkDepth: CheckResult;
  structuredData: CheckResult;
  eeatSignals: CheckResult;
  javascriptRendering: CheckResult;
  coreWebVitals: CheckResult;
  contentExtraction: CheckResult;
  openGraph: CheckResult;
  contentFreshness: CheckResult;
  multiPageSample: CheckResult;
}): { score: number; breakdown: ScoreBreakdown } {
  const s = (k: keyof typeof results) => getNormalizedScore(results[k]);

  const breakdown: ScoreBreakdown = {
    // Single check
    fetchability: s("fetchability"),

    // robots.txt 40% + bot simulation 40% + llms.txt 20%
    botAccess: avg(s("robotsTxt"), s("robotsTxt"), s("botAccessSimulation"), s("botAccessSimulation"), s("llmsTxt")) ,

    // meta robots 25% + canonical 30% + sitemap 25% + link depth 20%
    crawlSignals: (
      s("metaRobots") * 0.25 +
      s("canonical") * 0.30 +
      s("sitemap") * 0.25 +
      s("internalLinkDepth") * 0.20
    ),

    // JSON-LD 60% + E-E-A-T 40%
    structuredData: (
      s("structuredData") * 0.60 +
      s("eeatSignals") * 0.40
    ),

    // JS rendering 55% + CWV 45%
    rendering: (
      s("javascriptRendering") * 0.55 +
      s("coreWebVitals") * 0.45
    ),

    // content extraction 35% + open graph 30% + freshness 35%
    contentQuality: (
      s("contentExtraction") * 0.35 +
      s("openGraph") * 0.30 +
      s("contentFreshness") * 0.35
    ),

    // single check
    siteHealth: s("multiPageSample"),
  };

  const totalWeight = Object.values(CATEGORY_WEIGHTS).reduce((a, b) => a + b, 0);
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
