export type CheckStatus = "PASS" | "FAIL" | "WARNING";
export type CrawlabilityClassification = "Excellent" | "Good" | "Risky" | "Broken";

export interface CheckResult {
  status: CheckStatus;
  reason: string;
  metadata: Record<string, unknown>;
}

export interface PageSnapshot {
  url: string;
  finalUrl: string;
  statusCode: number | null;
  statusText: string | null;
  headers: Record<string, string>;
  body: string | null;
  fetchError?: string;
}

export interface CheckContext {
  inputUrl: string;
  normalizedUrl: URL;
  baseSnapshot?: PageSnapshot;
}

export interface BotSimulationResult {
  userAgent: string;
  statusCode: number | null;
  accessible: boolean;
  blocked: boolean;
  reason: string;
  responseLength: number;
  comparisonToBrowser?: {
    differentStatusCode: boolean;
    responseLengthDelta: number;
    responseLengthDeltaPercent: number;
    htmlDifferent: boolean;
    similarityScore: number;
  };
}

export interface CrawlabilityReport {
  url: string;
  checkedAt: string;
  score: number;
  overallStatus: CheckStatus;
  classification: CrawlabilityClassification;
  breakdown: {
    fetchability: number;
    botAccess: number;
    rendering: number;
    parsing: number;
    contentQuality: number;
  };
  checks: {
    fetchability: CheckResult;
    robotsTxt: CheckResult;
    botAccessSimulation: CheckResult;
    javascriptRendering: CheckResult;
    htmlParsability: CheckResult;
    contentExtraction: CheckResult;
  };
  summary: string;
}
