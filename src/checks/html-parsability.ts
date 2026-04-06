import type { CheckContext, CheckResult } from "../types.ts";

export async function runHtmlParsabilityCheck(
  context: CheckContext,
): Promise<CheckResult> {
  const html = context.baseSnapshot?.body ?? "";
  const contentType = context.baseSnapshot?.headers["content-type"] ?? "";

  if (!html) {
    return {
      status: "FAIL",
      reason: "No HTML content was fetched",
      metadata: {
        contentType,
      },
    };
  }

  const hasHtmlTag = /<html\b/i.test(html);
  const hasBodyTag = /<body\b/i.test(html);
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const malformedAngleBracketCount = (html.match(/</g)?.length ?? 0) - (html.match(/>/g)?.length ?? 0);
  const htmlishContentType =
    contentType.includes("text/html") || contentType.includes("application/xhtml+xml");

  const status =
    htmlishContentType && hasHtmlTag && hasBodyTag && malformedAngleBracketCount === 0
      ? "PASS"
      : !hasHtmlTag && !hasBodyTag
        ? "FAIL"
        : "WARNING";

  const reason =
    status === "PASS"
      ? "Fetched document looks like parseable HTML"
      : status === "FAIL"
        ? "Fetched document does not look like a valid HTML page"
        : "Fetched document is partially parseable but has structural or header issues";

  return {
    status,
    reason,
    metadata: {
      normalizedScore: status === "PASS" ? 1 : status === "WARNING" ? 0.5 : 0,
      contentType,
      hasHtmlTag,
      hasBodyTag,
      title: titleMatch?.[1]?.trim() ?? null,
      malformedAngleBracketCount,
      bodyLength: html.length,
    },
  };
}
