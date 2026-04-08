import type { CheckContext, CheckResult } from "../types.js";

interface OgField {
  property: string;
  label: string;
  weight: number;
}

const OG_FIELDS: OgField[] = [
  { property: "og:title", label: "Title", weight: 0.25 },
  { property: "og:description", label: "Description", weight: 0.25 },
  { property: "og:image", label: "Image", weight: 0.20 },
  { property: "og:type", label: "Type", weight: 0.15 },
  { property: "og:url", label: "URL", weight: 0.10 },
  { property: "twitter:card", label: "Twitter Card", weight: 0.05 },
];

function extractMetaProperty(html: string, property: string): string | null {
  // <meta property="og:..." content="...">
  const re1 = new RegExp(
    `<meta[^>]+property=["']${property.replace(":", "\\:")}["'][^>]+content=["']([^"']+)["'][^>]*>`,
    "i",
  );
  const m1 = html.match(re1);
  if (m1) return m1[1].trim();

  // reversed attribute order
  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${property.replace(":", "\\:")}["'][^>]*>`,
    "i",
  );
  const m2 = html.match(re2);
  if (m2) return m2[1].trim();

  // <meta name="twitter:card" content="...">
  const re3 = new RegExp(
    `<meta[^>]+name=["']${property.replace(":", "\\:")}["'][^>]+content=["']([^"']+)["'][^>]*>`,
    "i",
  );
  const m3 = html.match(re3);
  if (m3) return m3[1].trim();

  return null;
}

export async function runOpenGraphCheck(
  context: CheckContext,
): Promise<CheckResult> {
  const html = context.baseSnapshot?.body ?? "";

  if (!html) {
    return {
      status: "FAIL",
      reason: "No HTML available to check Open Graph metadata",
      metadata: { normalizedScore: 0, fields: {} },
    };
  }

  const fieldResults: Record<string, string | null> = {};
  let score = 0;
  const present: string[] = [];
  const missing: string[] = [];

  for (const field of OG_FIELDS) {
    const value = extractMetaProperty(html, field.property);
    fieldResults[field.property] = value;
    if (value) {
      score += field.weight;
      present.push(field.label);
    } else {
      missing.push(field.label);
    }
  }

  score = Number(Math.min(1, score).toFixed(2));

  const status = score >= 0.75 ? "PASS" : score >= 0.40 ? "WARNING" : "FAIL";

  const reason =
    status === "PASS"
      ? `Open Graph metadata is complete (${present.join(", ")})`
      : status === "WARNING"
        ? `Open Graph partially complete — missing: ${missing.join(", ")}`
        : `Open Graph metadata is largely missing — AI citation quality will be poor`;

  return {
    status,
    reason,
    metadata: {
      normalizedScore: score,
      present,
      missing,
      fields: fieldResults,
    },
  };
}
