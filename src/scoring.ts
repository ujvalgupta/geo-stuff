import type {
  CheckResult,
  CheckStatus,
  CrawlabilityClassification,
  ScoreBreakdown,
} from "./types.js";

const STATUS_TO_SCORE: Record<CheckStatus, number> = {
  PASS: 1,
  WARNING: 0.5,
  FAIL: 0,
};

const CATEGORY_WEIGHTS = {
  fetchability: 20,
  botAccess: 25,
  rendering: 20,
  parsing: 15,
  contentQuality: 20,
} as const;

function getNormalizedScore(result: CheckResult): number {
  const raw = result.metadata.normalizedScore;
  if (typeof raw === "number") {
    return Math.max(0, Math.min(1, raw));
  }

  return STATUS_TO_SCORE[result.status];
}

export function calculateScore(results: {
  fetchability: CheckResult;
  robotsTxt: CheckResult;
  botAccessSimulation: CheckResult;
  javascriptRendering: CheckResult;
  htmlParsability: CheckResult;
  contentExtraction: CheckResult;
}): { score: number; breakdown: ScoreBreakdown } {
  const normalizedBreakdown: ScoreBreakdown = {
    fetchability: getNormalizedScore(results.fetchability),
    botAccess:
      (getNormalizedScore(results.robotsTxt) +
        getNormalizedScore(results.botAccessSimulation)) / 2,
    rendering: getNormalizedScore(results.javascriptRendering),
    parsing: getNormalizedScore(results.htmlParsability),
    contentQuality: getNormalizedScore(results.contentExtraction),
  };

  const totalWeight = Object.values(CATEGORY_WEIGHTS).reduce((sum, value) => sum + value, 0);
  const weighted = Object.entries(CATEGORY_WEIGHTS).reduce((sum, [key, weight]) => {
    return sum + (normalizedBreakdown[key as keyof typeof normalizedBreakdown] * weight);
  }, 0);

  return {
    score: Math.round((weighted / totalWeight) * 100),
    breakdown: normalizedBreakdown,
  };
}

export function classifyScore(score: number): CrawlabilityClassification {
  if (score >= 80) {
    return "Excellent";
  }
  if (score >= 60) {
    return "Good";
  }
  if (score >= 40) {
    return "Risky";
  }
  return "Broken";
}

export function inferOverallStatus(score: number): CheckStatus {
  const classification = classifyScore(score);
  if (classification === "Excellent" || classification === "Good") {
    return "PASS";
  }
  if (classification === "Risky") {
    return "WARNING";
  }
  return "FAIL";
}
