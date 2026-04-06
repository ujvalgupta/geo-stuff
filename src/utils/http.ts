import type { PageSnapshot } from "../types.ts";

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

export function getOriginRobotsUrl(url: URL): string {
  return new URL("/robots.txt", url.origin).toString();
}
