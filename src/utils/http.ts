import type { PageSnapshot, RedirectHop } from "../types.js";

export async function fetchText(
  url: string,
  init?: RequestInit,
): Promise<PageSnapshot & { durationMs: number }> {
  const startedAt = Date.now();
  try {
    const response = await fetch(url, {
      redirect: "follow",
      ...init,
    });

    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });

    const contentType = headers["content-type"] ?? "";
    const body = contentType.includes("text") || contentType.includes("html")
      ? await response.text()
      : null;

    return {
      url,
      finalUrl: response.url,
      statusCode: response.status,
      statusText: response.statusText,
      headers,
      body,
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      url,
      finalUrl: url,
      statusCode: null,
      statusText: null,
      headers: {},
      body: null,
      fetchError: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - startedAt,
    };
  }
}

export async function fetchWithRedirectChain(
  url: string,
): Promise<{ chain: RedirectHop[]; finalUrl: string; durationMs: number; fetchError?: string }> {
  const startedAt = Date.now();
  const chain: RedirectHop[] = [];
  let currentUrl = url;
  const maxHops = 10;

  try {
    for (let hop = 0; hop < maxHops; hop++) {
      const response = await fetch(currentUrl, {
        redirect: "manual",
        signal: AbortSignal.timeout(10000),
      });

      chain.push({ url: currentUrl, statusCode: response.status });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) break;
        currentUrl = new URL(location, currentUrl).toString();
      } else {
        break;
      }
    }

    return { chain, finalUrl: currentUrl, durationMs: Date.now() - startedAt };
  } catch (error) {
    return {
      chain,
      finalUrl: currentUrl,
      durationMs: Date.now() - startedAt,
      fetchError: error instanceof Error ? error.message : String(error),
    };
  }
}

export function getOriginRobotsUrl(url: URL): string {
  return new URL("/robots.txt", url.origin).toString();
}

export function getOriginSitemapUrl(url: URL): string {
  return new URL("/sitemap.xml", url.origin).toString();
}

export function getOriginSitemapIndexUrl(url: URL): string {
  return new URL("/sitemap_index.xml", url.origin).toString();
}
