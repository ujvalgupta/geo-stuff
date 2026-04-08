import type { CheckContext, CheckResult } from "../types.js";
import { fetchText } from "../utils/http.js";

const MAX_PAGES_PER_LEVEL = 15;
const MAX_DEPTH = 3;
const FETCH_TIMEOUT_MS = 6000;

function extractInternalLinks(html: string, origin: string): string[] {
  const seen = new Set<string>();
  const regex = /href=["']([^"'#?\s]+)[^"']*["']/gi;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(html)) !== null) {
    const href = match[1];
    try {
      const url = new URL(href, origin);
      if (url.origin === origin && url.pathname !== "/" && url.pathname !== "") {
        const normalized = url.pathname.replace(/\/+$/, "") || "/";
        seen.add(normalized);
      }
    } catch { /* ignore invalid */ }
  }

  return [...seen];
}

function normalizePathname(url: URL): string {
  return url.pathname.replace(/\/+$/, "") || "/";
}

async function safeFetch(url: string): Promise<string | null> {
  try {
    const result = await Promise.race([
      fetchText(url),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), FETCH_TIMEOUT_MS)),
    ]);
    if (!result || typeof result !== "object" || !("body" in result)) return null;
    return (result as { body: string | null }).body;
  } catch {
    return null;
  }
}

export async function runInternalLinkDepthCheck(
  context: CheckContext,
): Promise<CheckResult> {
  const targetPathname = normalizePathname(context.normalizedUrl);
  const origin = context.normalizedUrl.origin;
  const homepageUrl = `${origin}/`;

  // If the analyzed URL IS the homepage, skip this check
  if (targetPathname === "/" || targetPathname === "") {
    return {
      status: "PASS",
      reason: "Analyzed URL is the homepage — link depth not applicable",
      metadata: {
        normalizedScore: 1,
        depth: 0,
        isHomepage: true,
      },
    };
  }

  // Level 0: fetch homepage
  const homepageHtml = await safeFetch(homepageUrl);
  if (!homepageHtml) {
    return {
      status: "WARNING",
      reason: "Could not fetch homepage to evaluate link depth",
      metadata: { normalizedScore: 0.5, depth: null, error: "Homepage fetch failed" },
    };
  }

  // Level 1: check homepage links
  const level1Links = extractInternalLinks(homepageHtml, origin);
  if (level1Links.includes(targetPathname)) {
    return {
      status: "PASS",
      reason: "Page is linked directly from the homepage (depth 1) — excellent crawlability",
      metadata: {
        normalizedScore: 1,
        depth: 1,
        homepageLinkCount: level1Links.length,
      },
    };
  }

  // Level 2: check pages linked from homepage
  const level2Candidates = level1Links.slice(0, MAX_PAGES_PER_LEVEL);
  const level2Results = await Promise.all(
    level2Candidates.map(async (path) => {
      const html = await safeFetch(`${origin}${path}`);
      if (!html) return [];
      return extractInternalLinks(html, origin);
    }),
  );

  const level2Links = new Set(level2Results.flat());
  if (level2Links.has(targetPathname)) {
    return {
      status: "PASS",
      reason: "Page is reachable within 2 clicks from homepage (depth 2) — good crawlability",
      metadata: {
        normalizedScore: 0.85,
        depth: 2,
        homepageLinkCount: level1Links.length,
        level2PagesChecked: level2Candidates.length,
      },
    };
  }

  if (MAX_DEPTH < 3) {
    return {
      status: "WARNING",
      reason: "Page not found within 2 clicks of homepage — may have reduced crawl priority",
      metadata: {
        normalizedScore: 0.4,
        depth: ">2",
        homepageLinkCount: level1Links.length,
      },
    };
  }

  // Level 3: check pages linked from level 2
  const level3Candidates = [...level2Links].slice(0, MAX_PAGES_PER_LEVEL);
  const level3Results = await Promise.all(
    level3Candidates.map(async (path) => {
      const html = await safeFetch(`${origin}${path}`);
      if (!html) return [];
      return extractInternalLinks(html, origin);
    }),
  );

  const level3Links = new Set(level3Results.flat());
  if (level3Links.has(targetPathname)) {
    return {
      status: "WARNING",
      reason: "Page reachable at depth 3 from homepage — consider adding it to a menu or sitemap for better AI crawl priority",
      metadata: {
        normalizedScore: 0.6,
        depth: 3,
        homepageLinkCount: level1Links.length,
        level2PagesChecked: level2Candidates.length,
        level3PagesChecked: level3Candidates.length,
      },
    };
  }

  return {
    status: "FAIL",
    reason: "Page not reachable within 3 clicks from homepage — likely orphaned and will rarely be crawled",
    metadata: {
      normalizedScore: 0.1,
      depth: ">3",
      homepageLinkCount: level1Links.length,
      level2PagesChecked: level2Candidates.length,
      level3PagesChecked: level3Candidates.length,
      recommendation: "Add this page to your main navigation, footer, or sitemap",
    },
  };
}
