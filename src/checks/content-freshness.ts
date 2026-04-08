import type { CheckContext, CheckResult } from "../types.js";

// Schema types that require frequent updates (news mode)
const NEWS_TYPES = new Set([
  "NewsArticle", "ReportageNewsArticle", "LiveBlogPosting", "BlogPosting",
]);

// Schema types that are evergreen — age is much less important
const EVERGREEN_TYPES = new Set([
  "HowTo", "FAQPage", "Recipe", "Course", "SoftwareApplication",
  "Product", "ProductGroup", "Organization", "Person", "LocalBusiness",
  "WebSite", "AboutPage", "ContactPage", "BreadcrumbList",
]);

interface FreshnessSignal {
  source: string;
  rawValue: string;
  parsedDate: Date | null;
}

type ContentMode = "news" | "evergreen" | "article" | "unknown";

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

function detectContentMode(html: string): ContentMode {
  const regex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    try {
      const obj = JSON.parse(match[1]) as Record<string, unknown>;
      const items = Array.isArray(obj) ? obj : [obj];
      for (const item of items) {
        const t = (item as Record<string, unknown>)["@type"];
        const type = Array.isArray(t) ? String(t[0]) : String(t ?? "");
        if (NEWS_TYPES.has(type)) return "news";
        if (EVERGREEN_TYPES.has(type)) return "evergreen";
        if (["Article", "TechArticle", "ScholarlyArticle"].includes(type)) return "article";
      }
    } catch { /* skip */ }
  }

  // Fallback: check OG type
  const ogTypeMatch = html.match(/<meta[^>]+property=["']og:type["'][^>]+content=["']([^"']+)["']/i);
  if (ogTypeMatch) {
    const ogType = ogTypeMatch[1].toLowerCase();
    if (ogType.includes("article") || ogType.includes("blog")) return "article";
    if (ogType.includes("website")) return "evergreen";
  }

  return "unknown";
}

function scoreAge(days: number, mode: ContentMode): number {
  switch (mode) {
    case "news":
      // News: must be very fresh
      if (days <= 1)   return 1.0;
      if (days <= 3)   return 0.9;
      if (days <= 7)   return 0.75;
      if (days <= 30)  return 0.55;
      if (days <= 90)  return 0.3;
      return 0.1;

    case "evergreen":
      // Evergreen: age matters much less, focus on having a date at all
      if (days <= 180) return 1.0;
      if (days <= 365) return 0.9;
      if (days <= 730) return 0.8;
      if (days <= 1095) return 0.65;
      return 0.5; // very old evergreen still gets partial credit

    case "article":
      // Standard articles: moderate freshness expectations
      if (days <= 30)  return 1.0;
      if (days <= 90)  return 0.88;
      if (days <= 180) return 0.75;
      if (days <= 365) return 0.6;
      if (days <= 730) return 0.4;
      return 0.2;

    default:
      // Unknown: use article-like thresholds but slightly more lenient
      if (days <= 30)  return 1.0;
      if (days <= 90)  return 0.85;
      if (days <= 180) return 0.7;
      if (days <= 365) return 0.55;
      if (days <= 730) return 0.35;
      return 0.2;
  }
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
  return html.match(re2)?.[1] ?? null;
}

function extractJsonLdDates(html: string): { datePublished?: string; dateModified?: string } {
  const result: { datePublished?: string; dateModified?: string } = {};
  const regex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    try {
      const obj = JSON.parse(match[1]) as Record<string, unknown>;
      if (typeof obj["dateModified"] === "string" && !result.dateModified) result.dateModified = obj["dateModified"];
      if (typeof obj["datePublished"] === "string" && !result.datePublished) result.datePublished = obj["datePublished"];
    } catch { /* skip */ }
  }
  return result;
}

export async function runContentFreshnessCheck(
  context: CheckContext,
): Promise<CheckResult> {
  const html = context.baseSnapshot?.body ?? "";
  const headers = context.baseSnapshot?.headers ?? {};

  const contentMode = detectContentMode(html);
  const signals: FreshnessSignal[] = [];

  // 1. JSON-LD dateModified (most authoritative)
  const jsonLdDates = extractJsonLdDates(html);
  if (jsonLdDates.dateModified) {
    signals.push({ source: "JSON-LD dateModified", rawValue: jsonLdDates.dateModified, parsedDate: tryParseDate(jsonLdDates.dateModified) });
  }
  if (jsonLdDates.datePublished) {
    signals.push({ source: "JSON-LD datePublished", rawValue: jsonLdDates.datePublished, parsedDate: tryParseDate(jsonLdDates.datePublished) });
  }

  // 2. HTTP Last-Modified header
  if (headers["last-modified"]) {
    signals.push({ source: "HTTP Last-Modified", rawValue: headers["last-modified"], parsedDate: tryParseDate(headers["last-modified"]) });
  }

  // 3. OG article dates
  const ogModified = extractMetaDate(html, "article:modified_time");
  if (ogModified) signals.push({ source: "og:article:modified_time", rawValue: ogModified, parsedDate: tryParseDate(ogModified) });

  const ogPublished = extractMetaDate(html, "article:published_time");
  if (ogPublished) signals.push({ source: "og:article:published_time", rawValue: ogPublished, parsedDate: tryParseDate(ogPublished) });

  // 4. Generic meta date tags
  const metaDate = extractMetaDate(html, "date") ?? extractMetaDate(html, "pubdate");
  if (metaDate) signals.push({ source: "meta date", rawValue: metaDate, parsedDate: tryParseDate(metaDate) });

  // 5. <time datetime="..."> element
  const timeMatch = html.match(/<time[^>]+datetime=["']([^"']+)["'][^>]*>/i);
  if (timeMatch) signals.push({ source: "<time datetime>", rawValue: timeMatch[1], parsedDate: tryParseDate(timeMatch[1]) });

  const modeLabel: Record<ContentMode, string> = {
    news: "News / Blog",
    evergreen: "Evergreen / Reference",
    article: "Article",
    unknown: "Unknown",
  };

  if (signals.length === 0) {
    // Evergreen pages without dates get a softer penalty
    const score = contentMode === "evergreen" ? 0.55 : 0.3;
    return {
      status: "WARNING",
      reason: `No date signals found — content type: ${modeLabel[contentMode]}. AI engines cannot determine freshness.`,
      metadata: {
        normalizedScore: score,
        contentMode,
        contentModeLabel: modeLabel[contentMode],
        signals: [],
        recommendation: "Add datePublished and dateModified to your JSON-LD schema",
      },
    };
  }

  const bestSignal = signals.find((s) => s.parsedDate !== null);
  if (!bestSignal?.parsedDate) {
    return {
      status: "WARNING",
      reason: "Date fields found but none could be parsed into a valid date",
      metadata: {
        normalizedScore: 0.35,
        contentMode,
        contentModeLabel: modeLabel[contentMode],
        signals: signals.map((s) => ({ source: s.source, rawValue: s.rawValue, valid: false })),
      },
    };
  }

  const days = ageInDays(bestSignal.parsedDate);
  const score = scoreAge(days, contentMode);
  const status: "PASS" | "WARNING" | "FAIL" = score >= 0.7 ? "PASS" : score >= 0.35 ? "WARNING" : "FAIL";

  const freshnessLabel =
    days <= 1 ? "today"
    : days <= 3 ? "very fresh"
    : days <= 7 ? "fresh this week"
    : days <= 30 ? "fresh this month"
    : days <= 90 ? "recent"
    : days <= 365 ? "aging"
    : days <= 730 ? "stale"
    : "very stale";

  const reason =
    status === "PASS"
      ? `Content is ${freshnessLabel} (${days}d, ${modeLabel[contentMode]}) — appropriate for content type`
      : status === "WARNING"
        ? `Content is ${freshnessLabel} (${days}d) — ${contentMode === "news" ? "news content should be updated frequently" : "consider refreshing"}`
        : `Content is ${freshnessLabel} (${days}d) — too old for AI engines to prioritize`;

  return {
    status,
    reason,
    metadata: {
      normalizedScore: score,
      contentMode,
      contentModeLabel: modeLabel[contentMode],
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
