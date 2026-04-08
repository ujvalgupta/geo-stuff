import type { CheckContext, CheckResult } from "../types.js";
import { fetchText, getOriginSitemapUrl, getOriginSitemapIndexUrl } from "../utils/http.js";

const SITEMAP_URL_LIMIT = 50_000;

function normalizeUrl(u: string): string {
  return u.replace(/\/+$/, "").split("?")[0].split("#")[0];
}

function urlInSitemap(body: string, targetUrl: string): boolean {
  const target = normalizeUrl(targetUrl);
  const targetNoProto = target.replace(/^https?:\/\//, "");
  if (body.includes(target) || body.includes(targetNoProto)) return true;

  const locs = body.match(/<loc>([\s\S]*?)<\/loc>/gi) ?? [];
  for (const tag of locs) {
    const loc = tag.replace(/<\/?loc>/gi, "").trim();
    if (normalizeUrl(loc) === target || normalizeUrl(loc).replace(/^https?:\/\//, "") === targetNoProto) {
      return true;
    }
  }
  return false;
}

interface SitemapQuality {
  urlCount: number;
  withLastmod: number;
  withChangefreq: number;
  lastmodDates: Date[];
  exceedsLimit: boolean;
  pctWithLastmod: number;
  newestLastmod: Date | null;
  oldestLastmod: Date | null;
}

function analyzeSitemapQuality(body: string): SitemapQuality {
  const locs = body.match(/<loc>[\s\S]*?<\/loc>/gi) ?? [];
  const urlCount = locs.length;
  const exceedsLimit = urlCount >= SITEMAP_URL_LIMIT;

  const lastmodTags = body.match(/<lastmod>([\s\S]*?)<\/lastmod>/gi) ?? [];
  const lastmodDates: Date[] = [];
  for (const tag of lastmodTags) {
    const raw = tag.replace(/<\/?lastmod>/gi, "").trim();
    const d = new Date(raw);
    if (!isNaN(d.getTime())) lastmodDates.push(d);
  }

  const changefreqTags = body.match(/<changefreq>/gi) ?? [];

  const withLastmod = lastmodDates.length;
  const pctWithLastmod = urlCount > 0 ? Math.round((withLastmod / urlCount) * 100) : 0;

  const sorted = [...lastmodDates].sort((a, b) => a.getTime() - b.getTime());

  return {
    urlCount,
    withLastmod,
    withChangefreq: changefreqTags.length,
    lastmodDates,
    exceedsLimit,
    pctWithLastmod,
    newestLastmod: sorted.length ? sorted[sorted.length - 1] : null,
    oldestLastmod: sorted.length ? sorted[0] : null,
  };
}

async function fetchAndCheckNestedSitemaps(
  indexBody: string,
  targetUrl: string,
): Promise<{ found: boolean; quality: SitemapQuality | null }> {
  const locs = indexBody.match(/<loc>([\s\S]*?)<\/loc>/gi) ?? [];
  const limit = locs.slice(0, 6);

  for (const tag of limit) {
    const sitemapUrl = tag.replace(/<\/?loc>/gi, "").trim();
    try {
      const resp = await fetchText(sitemapUrl);
      if (!resp.body) continue;
      const found = urlInSitemap(resp.body, targetUrl);
      if (found) {
        return { found: true, quality: analyzeSitemapQuality(resp.body) };
      }
    } catch { /* continue */ }
  }
  return { found: false, quality: null };
}

export async function runSitemapCheck(
  context: CheckContext,
): Promise<CheckResult> {
  const targetUrl = context.normalizedUrl.toString();
  const sitemapUrl = getOriginSitemapUrl(context.normalizedUrl);
  const sitemapIndexUrl = getOriginSitemapIndexUrl(context.normalizedUrl);

  const [sitemapResp, sitemapIndexResp] = await Promise.all([
    fetchText(sitemapUrl),
    fetchText(sitemapIndexUrl),
  ]);

  const sitemapFound = !sitemapResp.fetchError && sitemapResp.statusCode === 200 && !!sitemapResp.body;
  const sitemapIndexFound = !sitemapIndexResp.fetchError && sitemapIndexResp.statusCode === 200 && !!sitemapIndexResp.body;

  if (!sitemapFound && !sitemapIndexFound) {
    return {
      status: "FAIL",
      reason: "No sitemap.xml or sitemap_index.xml found — AI crawlers may never discover your pages",
      metadata: {
        normalizedScore: 0.1,
        sitemapFound: false,
        sitemapIndexFound: false,
        urlInSitemap: false,
        recommendation: "Create a sitemap.xml and submit it to Google Search Console",
      },
    };
  }

  // Determine primary sitemap body and run quality analysis
  const primaryBody = (sitemapFound ? sitemapResp.body : sitemapIndexResp.body) ?? "";
  const quality = analyzeSitemapQuality(primaryBody);
  let foundInSitemap = urlInSitemap(primaryBody, targetUrl);
  let checkedSitemapUrl = sitemapFound ? sitemapUrl : sitemapIndexUrl;

  // Try nested sitemaps if not found yet
  if (!foundInSitemap) {
    if (sitemapIndexFound && sitemapIndexResp.body) {
      const nested = await fetchAndCheckNestedSitemaps(sitemapIndexResp.body, targetUrl);
      if (nested.found) foundInSitemap = true;
      checkedSitemapUrl = sitemapIndexUrl;
    } else if (sitemapFound && sitemapIndexFound && sitemapIndexResp.body) {
      const nested = await fetchAndCheckNestedSitemaps(sitemapIndexResp.body, targetUrl);
      if (nested.found) foundInSitemap = true;
    }
  }

  // Quality scoring
  const qualityIssues: string[] = [];
  if (quality.exceedsLimit) qualityIssues.push(`URL count (${quality.urlCount.toLocaleString()}) exceeds 50k limit per file`);
  if (quality.pctWithLastmod < 50 && quality.urlCount > 5) qualityIssues.push(`Only ${quality.pctWithLastmod}% of URLs have <lastmod>`);

  // Score calculation
  let score: number;
  if (!foundInSitemap) {
    score = 0.45; // sitemap exists but URL missing
  } else if (qualityIssues.length > 0) {
    score = 0.7; // found but quality issues
  } else if (quality.pctWithLastmod >= 80) {
    score = 1.0; // excellent
  } else {
    score = 0.85; // good
  }

  const status: "PASS" | "WARNING" | "FAIL" =
    score >= 0.75 ? "PASS" : score >= 0.4 ? "WARNING" : "FAIL";

  const reason = !foundInSitemap
    ? `Sitemap exists (${quality.urlCount} URLs) but this URL is not listed`
    : qualityIssues.length > 0
      ? `URL in sitemap but quality issues: ${qualityIssues.join("; ")}`
      : quality.pctWithLastmod >= 80
        ? `URL in sitemap with strong metadata (${quality.pctWithLastmod}% have lastmod)`
        : `URL found in sitemap (${quality.urlCount} total URLs, ${quality.pctWithLastmod}% have lastmod)`;

  return {
    status,
    reason,
    metadata: {
      normalizedScore: score,
      sitemapUrl: checkedSitemapUrl,
      sitemapFound: true,
      sitemapIndexFound,
      urlInSitemap: foundInSitemap,
      quality: {
        urlCount: quality.urlCount,
        exceedsLimit: quality.exceedsLimit,
        pctWithLastmod: quality.pctWithLastmod,
        withLastmod: quality.withLastmod,
        withChangefreq: quality.withChangefreq,
        newestLastmod: quality.newestLastmod?.toISOString() ?? null,
        oldestLastmod: quality.oldestLastmod?.toISOString() ?? null,
      },
      qualityIssues,
    },
  };
}
