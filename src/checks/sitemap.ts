import type { CheckContext, CheckResult } from "../types.js";
import { fetchText, getOriginSitemapUrl, getOriginSitemapIndexUrl } from "../utils/http.js";

function urlInSitemap(sitemapBody: string, targetUrl: string): boolean {
  // Normalize to compare without trailing slashes and query params
  const normalize = (u: string) => u.replace(/\/+$/, "").split("?")[0].split("#")[0];
  const target = normalize(targetUrl);
  const targetNoProtocol = target.replace(/^https?:\/\//, "");

  // Check for the URL directly in the sitemap XML
  if (sitemapBody.includes(target) || sitemapBody.includes(targetNoProtocol)) return true;

  // Also check without protocol in case sitemap uses http while page is https
  const urlMatches = sitemapBody.match(/<loc>([\s\S]*?)<\/loc>/gi) ?? [];
  for (const locTag of urlMatches) {
    const locContent = locTag.replace(/<\/?loc>/gi, "").trim();
    if (normalize(locContent) === target || normalize(locContent.replace(/^https?:\/\//, "")) === targetNoProtocol) {
      return true;
    }
  }

  return false;
}

async function trySitemapIndex(body: string, targetUrl: string): Promise<boolean> {
  // Extract nested sitemap URLs from sitemap index
  const sitemapUrls = body.match(/<loc>([\s\S]*?)<\/loc>/gi) ?? [];
  const limit = sitemapUrls.slice(0, 5); // check first 5 nested sitemaps only

  for (const locTag of limit) {
    const sitemapUrl = locTag.replace(/<\/?loc>/gi, "").trim();
    try {
      const resp = await fetchText(sitemapUrl);
      if (resp.body && urlInSitemap(resp.body, targetUrl)) return true;
    } catch {
      // continue
    }
  }
  return false;
}

export async function runSitemapCheck(
  context: CheckContext,
): Promise<CheckResult> {
  const targetUrl = context.normalizedUrl.toString();
  const sitemapUrl = getOriginSitemapUrl(context.normalizedUrl);
  const sitemapIndexUrl = getOriginSitemapIndexUrl(context.normalizedUrl);

  // Try /sitemap.xml first
  const sitemapResp = await fetchText(sitemapUrl);
  const sitemapIndexResp = await fetchText(sitemapIndexUrl);

  const sitemapFound = !sitemapResp.fetchError && sitemapResp.statusCode === 200 && !!sitemapResp.body;
  const sitemapIndexFound = !sitemapIndexResp.fetchError && sitemapIndexResp.statusCode === 200 && !!sitemapIndexResp.body;

  if (!sitemapFound && !sitemapIndexFound) {
    return {
      status: "WARNING",
      reason: "No sitemap.xml or sitemap_index.xml found — AI crawlers may not discover all pages",
      metadata: {
        normalizedScore: 0.3,
        sitemapUrl,
        sitemapIndexUrl,
        sitemapFound: false,
        sitemapIndexFound: false,
        urlInSitemap: false,
      },
    };
  }

  // Check if the target URL appears in the sitemap
  let foundInSitemap = false;
  let checkedUrl = sitemapFound ? sitemapUrl : sitemapIndexUrl;
  const body = (sitemapFound ? sitemapResp.body : sitemapIndexResp.body) ?? "";

  foundInSitemap = urlInSitemap(body, targetUrl);

  // If it's a sitemap index and URL not found in it, check nested sitemaps
  if (!foundInSitemap && sitemapIndexFound && sitemapIndexResp.body) {
    checkedUrl = sitemapIndexUrl;
    foundInSitemap = await trySitemapIndex(sitemapIndexResp.body, targetUrl);
  } else if (!foundInSitemap && sitemapFound && sitemapResp.body) {
    // Also check sitemap index if sitemap.xml didn't contain it
    if (sitemapIndexFound && sitemapIndexResp.body) {
      checkedUrl = sitemapIndexUrl;
      foundInSitemap = await trySitemapIndex(sitemapIndexResp.body, targetUrl);
    }
  }

  const status = foundInSitemap ? "PASS" : "WARNING";
  const reason = foundInSitemap
    ? `URL found in sitemap — crawlers can discover and prioritize this page`
    : `Sitemap exists but this URL was not found in it — page may not be prioritized for crawling`;

  return {
    status,
    reason,
    metadata: {
      normalizedScore: status === "PASS" ? 1 : 0.5,
      sitemapUrl: checkedUrl,
      sitemapFound: sitemapFound || sitemapIndexFound,
      sitemapIndexFound,
      urlInSitemap: foundInSitemap,
      targetUrl,
    },
  };
}
