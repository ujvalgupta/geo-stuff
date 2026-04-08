import type { CheckContext, CheckResult } from "../types.js";

interface FreshnessSignal {
  source: string;
  rawValue: string;
  parsedDate: Date | null;
}

function tryParseDate(value: string): Date | null {
  if (!value) return null;
  try {
    const d = new Date(value.trim());
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

function ageInDays(date: Date): number {
  return Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
}

function scoreAge(days: number): number {
  if (days < 30) return 1.0;
  if (days < 90) return 0.88;
  if (days < 180) return 0.75;
  if (days < 365) return 0.55;
  if (days < 730) return 0.35;
  return 0.15;
}

function extractJsonLdDates(html: string): { datePublished?: string; dateModified?: string } {
  const results: { datePublished?: string; dateModified?: string } = {};
  const regex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(html)) !== null) {
    try {
      const obj = JSON.parse(match[1]) as Record<string, unknown>;
      if (typeof obj["dateModified"] === "string" && !results.dateModified) {
        results.dateModified = obj["dateModified"];
      }
      if (typeof obj["datePublished"] === "string" && !results.datePublished) {
        results.datePublished = obj["datePublished"];
      }
    } catch {
      // continue
    }
  }

  return results;
}

function extractMetaDate(html: string, property: string): string | null {
  const re1 = new RegExp(
    `<meta[^>]+(?:name|property)=["']${property.replace(":", "\\:")}["'][^>]+content=["']([^"']+)["']`,
    "i",
  );
  const m1 = html.match(re1);
  if (m1) return m1[1];

  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${property.replace(":", "\\:")}["']`,
    "i",
  );
  const m2 = html.match(re2);
  return m2 ? m2[1] : null;
}

function extractFirstTimeElement(html: string): string | null {
  const match = html.match(/<time[^>]+datetime=["']([^"']+)["'][^>]*>/i);
  return match ? match[1] : null;
}

export async function runContentFreshnessCheck(
  context: CheckContext,
): Promise<CheckResult> {
  const html = context.baseSnapshot?.body ?? "";
  const headers = context.baseSnapshot?.headers ?? {};
  const signals: FreshnessSignal[] = [];

  // 1. JSON-LD dateModified (most authoritative)
  const jsonLdDates = extractJsonLdDates(html);
  if (jsonLdDates.dateModified) {
    signals.push({
      source: "JSON-LD dateModified",
      rawValue: jsonLdDates.dateModified,
      parsedDate: tryParseDate(jsonLdDates.dateModified),
    });
  }

  // 2. JSON-LD datePublished
  if (jsonLdDates.datePublished) {
    signals.push({
      source: "JSON-LD datePublished",
      rawValue: jsonLdDates.datePublished,
      parsedDate: tryParseDate(jsonLdDates.datePublished),
    });
  }

  // 3. HTTP Last-Modified header
  const lastModified = headers["last-modified"];
  if (lastModified) {
    signals.push({
      source: "HTTP Last-Modified header",
      rawValue: lastModified,
      parsedDate: tryParseDate(lastModified),
    });
  }

  // 4. OG article:modified_time / article:published_time
  const ogModified = extractMetaDate(html, "article:modified_time");
  if (ogModified) {
    signals.push({
      source: "og:article:modified_time",
      rawValue: ogModified,
      parsedDate: tryParseDate(ogModified),
    });
  }

  const ogPublished = extractMetaDate(html, "article:published_time");
  if (ogPublished) {
    signals.push({
      source: "og:article:published_time",
      rawValue: ogPublished,
      parsedDate: tryParseDate(ogPublished),
    });
  }

  // 5. Generic date meta tags
  const metaDate = extractMetaDate(html, "date") ?? extractMetaDate(html, "pubdate");
  if (metaDate) {
    signals.push({
      source: "meta date",
      rawValue: metaDate,
      parsedDate: tryParseDate(metaDate),
    });
  }

  // 6. First <time datetime="..."> element
  const timeEl = extractFirstTimeElement(html);
  if (timeEl) {
    signals.push({
      source: "<time datetime>",
      rawValue: timeEl,
      parsedDate: tryParseDate(timeEl),
    });
  }

  if (signals.length === 0) {
    return {
      status: "WARNING",
      reason: "No date signals found — AI engines cannot determine content freshness",
      metadata: {
        normalizedScore: 0.3,
        signals: [],
        recommendation: "Add datePublished and dateModified to your JSON-LD schema",
      },
    };
  }

  // Use the most authoritative parseable date (first in priority order)
  const bestSignal = signals.find((s) => s.parsedDate !== null);

  if (!bestSignal || !bestSignal.parsedDate) {
    return {
      status: "WARNING",
      reason: "Date fields found but could not be parsed into a valid date",
      metadata: {
        normalizedScore: 0.35,
        signals: signals.map((s) => ({ source: s.source, rawValue: s.rawValue, valid: s.parsedDate !== null })),
      },
    };
  }

  const days = ageInDays(bestSignal.parsedDate);
  const score = scoreAge(days);
  const status: "PASS" | "WARNING" | "FAIL" = score >= 0.75 ? "PASS" : score >= 0.35 ? "WARNING" : "FAIL";

  const freshnessLabel =
    days < 30 ? "very fresh"
    : days < 90 ? "fresh"
    : days < 180 ? "recent"
    : days < 365 ? "aging"
    : days < 730 ? "stale"
    : "very stale";

  const reason =
    status === "PASS"
      ? `Content is ${freshnessLabel} (${days} days old, via ${bestSignal.source})`
      : `Content is ${freshnessLabel} (${days} days old) — real-time AI engines may deprioritize it`;

  return {
    status,
    reason,
    metadata: {
      normalizedScore: score,
      ageInDays: days,
      freshnessLabel,
      bestSignalSource: bestSignal.source,
      bestSignalDate: bestSignal.parsedDate.toISOString(),
      allSignals: signals.map((s) => ({
        source: s.source,
        rawValue: s.rawValue,
        parsedDate: s.parsedDate?.toISOString() ?? null,
        ageInDays: s.parsedDate ? ageInDays(s.parsedDate) : null,
      })),
    },
  };
}
