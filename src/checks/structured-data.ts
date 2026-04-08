import type { CheckContext, CheckResult } from "../types.js";

const RECOGNIZED_TYPES = new Set([
  "Article", "NewsArticle", "BlogPosting", "TechArticle", "ScholarlyArticle",
  "Product", "ProductGroup",
  "FAQPage",
  "HowTo",
  "Organization", "LocalBusiness", "Corporation",
  "Person",
  "Recipe",
  "Event",
  "Course", "CourseInstance",
  "SoftwareApplication", "WebApplication", "MobileApplication",
  "WebPage", "WebSite", "AboutPage", "ContactPage",
  "BreadcrumbList",
  "Review", "AggregateRating",
  "VideoObject", "ImageObject",
  "JobPosting",
  "MedicalCondition", "Drug",
  "Book",
]);

// Key fields that should be present per schema type
const REQUIRED_FIELDS: Record<string, string[]> = {
  Article: ["headline"],
  NewsArticle: ["headline"],
  BlogPosting: ["headline"],
  TechArticle: ["headline"],
  Product: ["name"],
  FAQPage: ["mainEntity"],
  HowTo: ["name", "step"],
  Organization: ["name"],
  LocalBusiness: ["name"],
  Person: ["name"],
  Recipe: ["name", "recipeIngredient"],
  Event: ["name", "startDate"],
  Course: ["name"],
  SoftwareApplication: ["name"],
  WebSite: ["name"],
  JobPosting: ["title", "hiringOrganization"],
  Book: ["name", "author"],
  Review: ["itemReviewed"],
};

function extractJsonLd(html: string): unknown[] {
  const results: unknown[] = [];
  const regex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(html)) !== null) {
    try {
      const raw = match[1].trim();
      if (!raw) continue;
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const item of parsed) results.push(item);
      } else {
        results.push(parsed);
      }
    } catch {
      results.push({ _parseError: true });
    }
  }

  return results;
}

function getSchemaType(item: unknown): string | null {
  if (typeof item !== "object" || item === null) return null;
  const obj = item as Record<string, unknown>;
  const rawType = obj["@type"];
  if (typeof rawType === "string") return rawType;
  if (Array.isArray(rawType) && typeof rawType[0] === "string") return rawType[0];
  return null;
}

function checkValidContext(item: unknown): boolean {
  if (typeof item !== "object" || item === null) return false;
  const obj = item as Record<string, unknown>;
  const ctx = obj["@context"];
  if (typeof ctx !== "string") return false;
  return ctx.includes("schema.org");
}

function checkRequiredFields(
  item: unknown,
  schemaType: string,
): { missing: string[]; present: string[] } {
  const required = REQUIRED_FIELDS[schemaType] ?? [];
  const obj = typeof item === "object" && item !== null ? (item as Record<string, unknown>) : {};
  const missing = required.filter((f) => !obj[f]);
  const present = required.filter((f) => obj[f]);
  return { missing, present };
}

function titleMatchesSchema(html: string, items: unknown[]): boolean {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!titleMatch) return true; // can't compare, don't penalize

  const pageTitle = titleMatch[1].trim().toLowerCase();

  for (const item of items) {
    if (typeof item !== "object" || item === null) continue;
    const obj = item as Record<string, unknown>;
    const schemaTitle =
      typeof obj["headline"] === "string"
        ? obj["headline"].toLowerCase()
        : typeof obj["name"] === "string"
          ? obj["name"].toLowerCase()
          : null;

    if (!schemaTitle) continue;

    // Allow partial match — schema title should appear in page title or vice versa
    if (pageTitle.includes(schemaTitle.substring(0, 20)) || schemaTitle.includes(pageTitle.substring(0, 20))) {
      return true;
    }
  }

  return items.length === 0; // no items to compare, don't penalize
}

export async function runStructuredDataCheck(
  context: CheckContext,
): Promise<CheckResult> {
  const html = context.baseSnapshot?.body ?? "";

  if (!html) {
    return {
      status: "FAIL",
      reason: "No HTML available to check structured data",
      metadata: { normalizedScore: 0, schemasFound: [] },
    };
  }

  const items = extractJsonLd(html);

  if (items.length === 0) {
    return {
      status: "FAIL",
      reason: "No JSON-LD structured data found — AI engines cannot determine content type or context",
      metadata: {
        normalizedScore: 0,
        schemasFound: [],
        recommendation: "Add JSON-LD schema markup (Article, FAQPage, Product, etc.) to help AI engines understand your content",
      },
    };
  }

  const parseErrors = items.filter(
    (i) => typeof i === "object" && i !== null && "_parseError" in (i as Record<string, unknown>),
  );

  if (parseErrors.length > 0 && parseErrors.length === items.length) {
    return {
      status: "FAIL",
      reason: "JSON-LD blocks found but all contain invalid JSON — structured data is broken",
      metadata: {
        normalizedScore: 0.05,
        schemasFound: [],
        parseErrors: parseErrors.length,
      },
    };
  }

  const validItems = items.filter(
    (i) => !(typeof i === "object" && i !== null && "_parseError" in (i as Record<string, unknown>)),
  );

  const schemaTypes = validItems.map(getSchemaType).filter((t): t is string => t !== null);
  const recognizedTypes = schemaTypes.filter((t) => RECOGNIZED_TYPES.has(t));
  const unknownTypes = schemaTypes.filter((t) => !RECOGNIZED_TYPES.has(t));
  const hasValidContext = validItems.some(checkValidContext);

  // Check required fields for each recognized type
  const fieldChecks: Array<{ type: string; missing: string[]; present: string[] }> = [];
  for (const item of validItems) {
    const type = getSchemaType(item);
    if (type && RECOGNIZED_TYPES.has(type)) {
      const check = checkRequiredFields(item, type);
      fieldChecks.push({ type, ...check });
    }
  }

  const allMissingFields = fieldChecks.flatMap((f) => f.missing.map((m) => `${f.type}.${m}`));
  const titleMismatch = !titleMatchesSchema(html, validItems);

  // Scoring
  let score: number;

  if (recognizedTypes.length === 0) {
    score = 0.25; // has schema, but not recognized types
  } else if (allMissingFields.length > 0) {
    score = 0.55; // recognized types but missing key fields
  } else if (titleMismatch) {
    score = 0.65; // fields present but title mismatch
  } else {
    // Bonus for multiple types and valid context
    score = recognizedTypes.length >= 2 ? 1.0 : 0.88;
    if (!hasValidContext) score = Math.max(0, score - 0.1);
  }

  if (parseErrors.length > 0) score = Math.max(0, score - 0.15);

  score = Number(Math.min(1, Math.max(0, score)).toFixed(2));

  const status = score >= 0.75 ? "PASS" : score >= 0.4 ? "WARNING" : "FAIL";

  const reason =
    recognizedTypes.length === 0
      ? `JSON-LD found but schema types are not recognized (${schemaTypes.join(", ") || "none declared"})`
      : allMissingFields.length > 0
        ? `Schema found (${recognizedTypes.join(", ")}) but missing key fields: ${allMissingFields.join(", ")}`
        : titleMismatch
          ? `Schema found (${recognizedTypes.join(", ")}) but name/headline may not match the page title`
          : `Valid structured data found: ${recognizedTypes.join(", ")}`;

  return {
    status,
    reason,
    metadata: {
      normalizedScore: score,
      totalBlocks: items.length,
      parseErrors: parseErrors.length,
      schemaTypes,
      recognizedTypes,
      unknownTypes,
      hasValidContext,
      fieldChecks,
      missingFields: allMissingFields,
      titleMismatch,
    },
  };
}
