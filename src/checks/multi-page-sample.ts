import type { CheckContext, CheckResult } from "../types.js";
import { fetchText, getOriginSitemapUrl } from "../utils/http.js";

const SAMPLE_SIZE = 5; // homepage + up to 4 sitemap URLs
const FETCH_TIMEOUT_MS = 8000;

interface PageSample {
  url: string;
  statusCode: number | null;
  hasNoindex: boolean;
  hasJsonLd: boolean;
  hasSelfCanonical: boolean | null; // null = no canonical found
  hasTitle: boolean;
  hasMetaDesc: boolean;
  fetchError?: string;
}

async function safeFetch(url: string): Promise<{ body: string | null; statusCode: number | null; headers: Record<string, string>; fetchError?: string }> {
  try {
    const result = await Promise.race([
      fetchText(url),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), FETCH_TIMEOUT_MS)),
    ]);
    if (!result) return { body: null, statusCode: null, headers: {}, fetchError: "Timeout" };
    return result;
  } catch (err) {
    return { body: null, statusCode: null, headers: {}, fetchError: String(err) };
  }
}

function analyzePageHtml(html: string, url: string): Omit<PageSample, "url" | "statusCode" | "fetchError"> {
  const lc = html.toLowerCase();

  // noindex detection
  const hasNoindex =
    /content=["'][^"']*noindex/i.test(html) ||
    /x-robots-tag[^:]*:\s*[^;]*noindex/i.test(html);

  // JSON-LD detection
  const hasJsonLd = /<script[^>]+type=["']application\/ld\+json["']/i.test(html);

  // Canonical detection
  const canonicalMatch =
    html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i) ??
    html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i);

  let hasSelfCanonical: boolean | null = null;
  if (canonicalMatch) {
    try {
      const canonical = new URL(canonicalMatch[1], url);
      const analyzed = new URL(url);
      hasSelfCanonical =
        canonical.hostname === analyzed.hostname &&
        canonical.pathname.replace(/\/+$/, "") === analyzed.pathname.replace(/\/+$/, "");
    } catch {
      hasSelfCanonical = false;
    }
  }

  const hasTitle = /<title[^>]*>[^<]{3,}<\/title>/i.test(html);
  const hasMetaDesc = /name=["']description["'][^>]+content=["'][^"']{10,}/i.test(html) ||
    /content=["'][^"']{10,}["'][^>]+name=["']description["']/i.test(html);

  return { hasNoindex, hasJsonLd, hasSelfCanonical, hasTitle, hasMetaDesc };
}

async function extractSitemapUrls(origin: string, limit: number): Promise<string[]> {
  try {
    const resp = await safeFetch(`${origin}/sitemap.xml`);
    if (!resp.body) return [];
    const locs = resp.body.match(/<loc>([\s\S]*?)<\/loc>/gi) ?? [];
    return locs
      .map((t) => t.replace(/<\/?loc>/gi, "").trim())
      .filter((u) => u.startsWith(origin) || u.startsWith("http"))
      .slice(0, limit);
  } catch {
    return [];
  }
}

export async function runMultiPageSampleCheck(
  context: CheckContext,
): Promise<CheckResult> {
  const origin = context.normalizedUrl.origin;
  const analyzedUrl = context.normalizedUrl.toString();

  // Collect URLs: homepage + sitemap sample
  const homepageUrl = `${origin}/`;
  const sitemapUrls = await extractSitemapUrls(origin, SAMPLE_SIZE - 1);

  // Deduplicate, always include homepage, exclude already-analyzed URL from sample
  const urlsToSample = [
    homepageUrl,
    ...sitemapUrls.filter((u) => u !== analyzedUrl && u !== homepageUrl),
  ].slice(0, SAMPLE_SIZE);

  // Fetch all pages in parallel
  const fetchResults = await Promise.all(
    urlsToSample.map(async (url): Promise<PageSample> => {
      const resp = await safeFetch(url);
      if (!resp.body || resp.fetchError) {
        return {
          url,
          statusCode: resp.statusCode,
          hasNoindex: false,
          hasJsonLd: false,
          hasSelfCanonical: null,
          hasTitle: false,
          hasMetaDesc: false,
          fetchError: resp.fetchError,
        };
      }
      return {
        url,
        statusCode: resp.statusCode,
        ...analyzePageHtml(resp.body, url),
      };
    }),
  );

  const successfulPages = fetchResults.filter((p) => !p.fetchError && p.statusCode && p.statusCode < 400);
  const total = successfulPages.length;

  if (total === 0) {
    return {
      status: "WARNING",
      reason: "Could not sample any pages from this site",
      metadata: { normalizedScore: 0.5, pagesAttempted: urlsToSample.length, pagesSampled: 0 },
    };
  }

  // Calculate site-wide rates
  const noindexCount = successfulPages.filter((p) => p.hasNoindex).length;
  const jsonLdCount = successfulPages.filter((p) => p.hasJsonLd).length;
  const selfCanonicalCount = successfulPages.filter((p) => p.hasSelfCanonical === true).length;
  const missingCanonicalCount = successfulPages.filter((p) => p.hasSelfCanonical === null).length;
  const errorPages = fetchResults.filter((p) => p.statusCode && p.statusCode >= 400);
  const missingTitleCount = successfulPages.filter((p) => !p.hasTitle).length;
  const missingMetaDescCount = successfulPages.filter((p) => !p.hasMetaDesc).length;

  const pctNoindex = Math.round((noindexCount / total) * 100);
  const pctJsonLd = Math.round((jsonLdCount / total) * 100);
  const pctSelfCanonical = Math.round((selfCanonicalCount / total) * 100);

  // Scoring
  const issues: string[] = [];
  if (pctNoindex > 0) issues.push(`${pctNoindex}% of sampled pages have noindex`);
  if (pctJsonLd < 50) issues.push(`Only ${pctJsonLd}% of sampled pages have JSON-LD`);
  if (pctSelfCanonical < 50 && missingCanonicalCount < total * 0.5) issues.push(`Only ${pctSelfCanonical}% have self-referencing canonical`);
  if (errorPages.length > 0) issues.push(`${errorPages.length} page${errorPages.length > 1 ? "s" : ""} returning errors`);
  if (missingTitleCount > 0) issues.push(`${missingTitleCount} page${missingTitleCount > 1 ? "s" : ""} missing title tag`);

  let score: number;
  if (issues.length === 0) score = 1.0;
  else if (issues.length === 1) score = 0.75;
  else if (issues.length === 2) score = 0.55;
  else score = 0.3;

  // Penalize heavily if noindex is widespread
  if (pctNoindex > 50) score = Math.min(score, 0.2);

  score = Number(score.toFixed(2));
  const status: "PASS" | "WARNING" | "FAIL" = score >= 0.75 ? "PASS" : score >= 0.4 ? "WARNING" : "FAIL";

  const reason =
    issues.length === 0
      ? `Site-wide patterns look healthy across ${total} sampled pages`
      : `Site-wide issues detected: ${issues[0]}${issues.length > 1 ? ` (+${issues.length - 1} more)` : ""}`;

  return {
    status,
    reason,
    metadata: {
      normalizedScore: score,
      pagesSampled: total,
      pagesAttempted: urlsToSample.length,
      siteWideStats: {
        pctWithJsonLd: pctJsonLd,
        pctWithSelfCanonical: pctSelfCanonical,
        pctWithNoindex: pctNoindex,
        errorPageCount: errorPages.length,
        missingTitleCount,
        missingMetaDescCount,
      },
      issues,
      pages: fetchResults.map((p) => ({
        url: p.url,
        statusCode: p.statusCode,
        hasNoindex: p.hasNoindex,
        hasJsonLd: p.hasJsonLd,
        hasSelfCanonical: p.hasSelfCanonical,
        hasTitle: p.hasTitle,
        error: p.fetchError ?? null,
      })),
    },
  };
}
