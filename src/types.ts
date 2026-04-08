export type CheckStatus = "PASS" | "FAIL" | "WARNING";
export type CrawlabilityClassification = "Excellent" | "Good" | "Risky" | "Broken";

export interface ScoreBreakdown {
  fetchability: number;
  botAccess: number;
  crawlSignals: number;
  structuredData: number;
  rendering: number;
  contentQuality: number;
}

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

export interface RedirectHop {
  url: string;
  statusCode: number;
}

export interface CheckContext {
  inputUrl: string;
  normalizedUrl: URL;
  baseSnapshot?: PageSnapshot & { durationMs: number; redirectChain?: RedirectHop[] };
}

export interface BotSimulationResult {
  botName: string;
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
    similarityScore: number;
  };
}

export interface CrawlabilityReport {
  url: string;
  checkedAt: string;
  score: number;
  overallStatus: CheckStatus;
  classification: CrawlabilityClassification;
  breakdown: ScoreBreakdown;
  checks: {
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
  };
  summary: string;
}
