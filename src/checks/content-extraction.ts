import type { CheckContext, CheckResult } from "../types.js";
import {
  clip,
  extractPreferredContent,
  stripBoilerplate,
  stripTags,
  wordCount,
} from "../utils/text.js";

function wordCountScore(words: number): number {
  if (words >= 600) return 1.0;
  if (words >= 300) return 0.75;
  if (words >= 150) return 0.55;
  if (words >= 75) return 0.35;
  return 0.15;
}

function extractionScore(source: string): number {
  if (source === "article" || source === "main" || source === "role=main") return 1.0;
  if (source === "body") return 0.6;
  return 0.35;
}

function metadataScore(title: string, description: string): number {
  const hasTitle = title.length > 0;
  const hasDesc = description.length > 0;
  if (hasTitle && hasDesc) return 1.0;
  if (hasTitle || hasDesc) return 0.5;
  return 0.0;
}

function uniqueContentRatio(fullBodyText: string, strippedText: string): number {
  const fullLen = fullBodyText.length;
  const uniqueLen = strippedText.length;
  if (fullLen === 0) return 0;
  const ratio = uniqueLen / fullLen;
  if (ratio > 0.5) return 1.0;
  if (ratio > 0.3) return 0.75;
  if (ratio > 0.15) return 0.5;
  return 0.25;
}

export async function runContentExtractionCheck(
  context: CheckContext,
): Promise<CheckResult> {
  const html = context.baseSnapshot?.body ?? "";

  if (!html) {
    return {
      status: "FAIL",
      reason: "No HTML content available for extraction",
      metadata: { normalizedScore: 0 },
    };
  }

  const { extractedHtml, source } = extractPreferredContent(html);
  const text = stripTags(extractedHtml);
  const words = wordCount(text);

  const fullBodyHtml = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? html;
  const boilerplateStripped = stripTags(stripBoilerplate(fullBodyHtml));
  const fullBodyText = stripTags(fullBodyHtml);

  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? "";
  const description =
    html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1] ??
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i)?.[1] ??
    "";

  const wScore = wordCountScore(words);
  const eScore = extractionScore(source);
  const mScore = metadataScore(title, description);
  const uScore = uniqueContentRatio(fullBodyText, boilerplateStripped);

  const contentScore = Number(
    (wScore * 0.40 + eScore * 0.30 + mScore * 0.20 + uScore * 0.10).toFixed(2),
  );

  const status =
    contentScore >= 0.70 ? "PASS" : contentScore >= 0.40 ? "WARNING" : "FAIL";

  const reason =
    status === "PASS"
      ? "Content is substantial and cleanly extractable"
      : status === "WARNING"
        ? words < 150
          ? `Thin content — only ${words} words extracted (aim for 300+)`
          : "Content extracted but structure or metadata is weak"
        : words < 75
          ? `Too little content to extract (${words} words)`
          : "Content extraction quality is insufficient";

  return {
    status,
    reason,
    metadata: {
      normalizedScore: contentScore,
      extractionSource: source,
      extractedWordCount: words,
      scores: {
        wordCount: wScore,
        extraction: eScore,
        metadata: mScore,
        uniqueContent: uScore,
      },
      title: title || null,
      metaDescription: description || null,
      textSample: clip(text, 220),
    },
  };
}
