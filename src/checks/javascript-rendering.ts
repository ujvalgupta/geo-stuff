import type { CheckContext, CheckResult } from "../types.js";
import { compareRawAndRenderedPage } from "../utils/rendering.js";

function countMatches(input: string, regex: RegExp): number {
  return input.match(regex)?.length ?? 0;
}

export async function runJavascriptRenderingCheck(
  context: CheckContext,
): Promise<CheckResult> {
  const html = context.baseSnapshot?.body ?? "";
  if (!html) {
    return {
      status: "FAIL",
      reason: "No HTML body available to inspect rendering strategy",
      metadata: {},
    };
  }

  const scripts = countMatches(html, /<script\b/gi);
  const meaningfulTextLength = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim().length;
  const hasRootOnlyMarkup =
    /<body[^>]*>\s*<div[^>]+id=["'](?:root|app|__next)["'][^>]*>\s*<\/div>\s*<\/body>/i.test(
      html,
    ) ||
    /<div[^>]+id=["'](?:root|app|__next)["'][^>]*>\s*<\/div>/i.test(html);
  const hydrationSignals = [
    "__NEXT_DATA__",
    "window.__INITIAL_STATE__",
    "window.__NUXT__",
    "data-reactroot",
    "id=\"__NEXT_DATA__\"",
  ].filter((signal) => html.includes(signal));

  const likelyCsr =
    hasRootOnlyMarkup ||
    (scripts >= 5 && meaningfulTextLength < 250) ||
    (hydrationSignals.length > 0 && meaningfulTextLength < 200);
  const renderComparison = await compareRawAndRenderedPage(
    context.normalizedUrl.toString(),
    html,
  );
  const heavilyJsDependent = renderComparison.available
    ? renderComparison.heavilyJsDependent
    : likelyCsr;
  const renderDependencyScore = renderComparison.available
    ? renderComparison.renderDependencyScore
    : likelyCsr
      ? 0.7
      : 0.1;
  const status = heavilyJsDependent ? "WARNING" : "PASS";

  return {
    status,
    reason: heavilyJsDependent
      ? "Page appears to depend heavily on JavaScript rendering"
      : "Page appears to expose meaningful HTML without requiring heavy client rendering",
    metadata: {
      normalizedScore: status === "PASS" ? 1 : 0.5,
      scriptTagCount: scripts,
      meaningfulTextLength,
      hasRootOnlyMarkup,
      hydrationSignals,
      inferredRenderingMode: likelyCsr ? "Likely CSR" : "Likely SSR/Static",
      rawTextLength: renderComparison.rawTextLength,
      renderedTextLength: renderComparison.renderedTextLength,
      rawDomNodeCount: renderComparison.rawDomNodeCount,
      renderedDomNodeCount: renderComparison.renderedDomNodeCount,
      renderDependencyScore,
      heavilyJsDependent,
      playwrightAvailable: renderComparison.available,
      playwrightError: renderComparison.error,
    },
  };
}
