import type { CheckContext, CheckResult } from "../types.js";

function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    // Strip trailing slash for comparison, lowercase host
    parsed.hostname = parsed.hostname.toLowerCase();
    if (parsed.pathname === "/") return parsed.origin + "/";
    parsed.pathname = parsed.pathname.replace(/\/+$/, "");
    return parsed.toString();
  } catch {
    return url.trim();
  }
}

export async function runCanonicalCheck(
  context: CheckContext,
): Promise<CheckResult> {
  const html = context.baseSnapshot?.body ?? "";

  if (!html) {
    return {
      status: "WARNING",
      reason: "No HTML available to check canonical tag",
      metadata: { normalizedScore: 0.5, canonicalUrl: null },
    };
  }

  // Match <link rel="canonical" href="..."> in either attribute order
  const canonicalMatch =
    html.match(/<link\s+[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["'][^>]*>/i) ??
    html.match(/<link\s+[^>]*href=["']([^"']+)["'][^>]*rel=["']canonical["'][^>]*>/i);

  if (!canonicalMatch) {
    return {
      status: "WARNING",
      reason: "No canonical tag found — search engines may treat duplicate URLs as separate pages",
      metadata: {
        normalizedScore: 0.5,
        canonicalUrl: null,
        recommendation: "Add <link rel=\"canonical\" href=\"...\"> to declare the preferred URL",
      },
    };
  }

  const canonicalUrl = canonicalMatch[1].trim();
  const analyzedUrl = context.normalizedUrl.toString();

  let isSelfReferencing = false;
  try {
    isSelfReferencing = normalizeUrl(canonicalUrl) === normalizeUrl(analyzedUrl);
  } catch {
    isSelfReferencing = false;
  }

  if (isSelfReferencing) {
    return {
      status: "PASS",
      reason: "Canonical tag is self-referencing — this is the authoritative URL for this content",
      metadata: {
        normalizedScore: 1,
        canonicalUrl,
        analyzedUrl,
        isSelfReferencing: true,
      },
    };
  }

  // Canonical points elsewhere
  return {
    status: "FAIL",
    reason: `Canonical points to a different URL — AI crawlers will attribute this content to ${canonicalUrl} instead`,
    metadata: {
      normalizedScore: 0,
      canonicalUrl,
      analyzedUrl,
      isSelfReferencing: false,
    },
  };
}
