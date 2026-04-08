import type { CheckContext, CheckResult } from "../types.js";

interface CWVMetrics {
  lcp: number | null;   // Largest Contentful Paint (ms)
  cls: number | null;   // Cumulative Layout Shift (score)
  fcp: number | null;   // First Contentful Paint (ms)
  ttfb: number | null;  // Time to First Byte (ms)
  tbt: number | null;   // Total Blocking Time (ms)
}

// Google's thresholds (Good / Needs Improvement / Poor)
const THRESHOLDS = {
  lcp:  { good: 2500,  poor: 4000  },
  cls:  { good: 0.1,   poor: 0.25  },
  fcp:  { good: 1800,  poor: 3000  },
  ttfb: { good: 800,   poor: 1800  },
  tbt:  { good: 200,   poor: 600   },
};

function rateMetric(
  key: keyof typeof THRESHOLDS,
  value: number | null,
): "good" | "needs-improvement" | "poor" | "unknown" {
  if (value === null) return "unknown";
  const t = THRESHOLDS[key];
  if (value <= (t as { good: number }).good) return "good";
  if (value <= (t as { poor: number }).poor) return "needs-improvement";
  return "poor";
}

function scoreMetric(rating: string): number {
  if (rating === "good") return 1;
  if (rating === "needs-improvement") return 0.5;
  if (rating === "poor") return 0;
  return 0.5; // unknown
}

async function measureWithPlaywright(url: string): Promise<CWVMetrics & { error?: string }> {
  try {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: true });

    try {
      const page = await browser.newPage();

      // Inject PerformanceObserver before navigation to capture LCP + CLS
      await page.addInitScript(() => {
        (window as unknown as Record<string, unknown>).__cwv = { lcp: null, cls: 0 };

        new PerformanceObserver((list) => {
          const entries = list.getEntries();
          for (const entry of entries) {
            (window as unknown as Record<string, unknown>).__cwv = {
              ...(window as unknown as Record<string, Record<string, unknown>>).__cwv,
              lcp: (entry as PerformanceEntry & { startTime: number }).startTime,
            };
          }
        }).observe({ type: "largest-contentful-paint", buffered: true });

        new PerformanceObserver((list) => {
          const cwv = (window as unknown as Record<string, Record<string, unknown>>).__cwv;
          let cls = (cwv["cls"] as number) ?? 0;
          for (const entry of list.getEntries()) {
            const shift = entry as PerformanceEntry & { hadRecentInput: boolean; value: number };
            if (!shift.hadRecentInput) cls += shift.value;
          }
          cwv["cls"] = cls;
        }).observe({ type: "layout-shift", buffered: true });
      });

      await page.goto(url, { waitUntil: "networkidle", timeout: 20000 });

      // Wait a moment for observers to settle
      await page.waitForTimeout(1000);

      const metrics = await page.evaluate(() => {
        const cwv = (window as unknown as Record<string, Record<string, unknown>>).__cwv ?? {};
        const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
        const fcp = performance.getEntriesByName("first-contentful-paint")[0] as PerformanceEntry & { startTime: number } | undefined;

        // Total Blocking Time: sum of long task excess durations
        const longTasks = performance.getEntriesByType("longtask") as Array<PerformanceEntry & { duration: number }>;
        const tbt = longTasks.reduce((sum, t) => sum + Math.max(0, t.duration - 50), 0);

        return {
          lcp: typeof cwv["lcp"] === "number" ? cwv["lcp"] : null,
          cls: typeof cwv["cls"] === "number" ? cwv["cls"] : null,
          fcp: fcp ? fcp.startTime : null,
          ttfb: nav ? nav.responseStart - nav.requestStart : null,
          tbt: tbt > 0 ? tbt : null,
        };
      });

      return metrics;
    } finally {
      await browser.close();
    }
  } catch (error) {
    return {
      lcp: null, cls: null, fcp: null, ttfb: null, tbt: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function runCoreWebVitalsCheck(
  context: CheckContext,
): Promise<CheckResult> {
  const url = context.normalizedUrl.toString();
  const result = await measureWithPlaywright(url);

  if (result.error && result.lcp === null && result.fcp === null) {
    return {
      status: "WARNING",
      reason: "Core Web Vitals could not be measured (Playwright unavailable or page timed out)",
      metadata: {
        normalizedScore: 0.5,
        available: false,
        error: result.error,
      },
    };
  }

  const ratings = {
    lcp:  rateMetric("lcp", result.lcp),
    cls:  rateMetric("cls", result.cls),
    fcp:  rateMetric("fcp", result.fcp),
    ttfb: rateMetric("ttfb", result.ttfb),
    tbt:  rateMetric("tbt", result.tbt),
  };

  // Weighted score: LCP and CLS are the primary signals (Google Core Web Vitals)
  const weightedScore =
    scoreMetric(ratings.lcp)  * 0.30 +
    scoreMetric(ratings.cls)  * 0.25 +
    scoreMetric(ratings.fcp)  * 0.20 +
    scoreMetric(ratings.ttfb) * 0.15 +
    scoreMetric(ratings.tbt)  * 0.10;

  const score = Number(weightedScore.toFixed(2));
  const status = score >= 0.75 ? "PASS" : score >= 0.45 ? "WARNING" : "FAIL";

  const poorMetrics = Object.entries(ratings)
    .filter(([, r]) => r === "poor")
    .map(([k]) => k.toUpperCase());
  const goodMetrics = Object.entries(ratings)
    .filter(([, r]) => r === "good")
    .map(([k]) => k.toUpperCase());

  const reason =
    poorMetrics.length === 0
      ? `Core Web Vitals are healthy (${goodMetrics.join(", ")} all good)`
      : `Poor vitals: ${poorMetrics.join(", ")} — Googlebot deprioritizes slow pages for AI Overview`;

  const fmt = (v: number | null, unit: string) =>
    v !== null ? `${Math.round(v)}${unit}` : "n/a";

  return {
    status,
    reason,
    metadata: {
      normalizedScore: score,
      available: true,
      metrics: {
        lcp:  { value: result.lcp,  formatted: fmt(result.lcp, "ms"),  rating: ratings.lcp,  threshold: "good ≤2500ms" },
        cls:  { value: result.cls,  formatted: result.cls !== null ? result.cls.toFixed(3) : "n/a", rating: ratings.cls, threshold: "good ≤0.1" },
        fcp:  { value: result.fcp,  formatted: fmt(result.fcp, "ms"),  rating: ratings.fcp,  threshold: "good ≤1800ms" },
        ttfb: { value: result.ttfb, formatted: fmt(result.ttfb, "ms"), rating: ratings.ttfb, threshold: "good ≤800ms" },
        tbt:  { value: result.tbt,  formatted: fmt(result.tbt, "ms"),  rating: ratings.tbt,  threshold: "good ≤200ms" },
      },
      poorMetrics,
      goodMetrics,
    },
  };
}
