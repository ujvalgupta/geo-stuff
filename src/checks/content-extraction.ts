import type { CheckContext, CheckResult } from "../types.js";
import {
  clip,
  extractPreferredContent,
  stripBoilerplate,
  stripTags,
  wordCount,
} from "../utils/text.js";

function countBlockElements(html: string): number {
  return html.match(/<(p|div|section|article|main|li|blockquote)\b/gi)?.length ?? 0;
}

function computeTextDensity(text: string, contentHtml: string): number {
  const blocks = Math.max(countBlockElements(contentHtml), 1);
  const density = wordCount(text) / blocks;
  return Number(density.toFixed(2));
}

function computeHeadingHierarchyScore(contentHtml: string): number {
  const headingLevels = Array.from(
    contentHtml.matchAll(/<h([1-6])\b[^>]*>/gi),
    (match) => Number(match[1]),
  );

  if (headingLevels.length === 0) {
    return 0.2;
  }

  let score = 1;
  for (let index = 1; index < headingLevels.length; index += 1) {
    const previous = headingLevels[index - 1];
    const current = headingLevels[index];
    const jump = current - previous;
    if (jump > 1) {
      score -= 0.2 * (jump - 1);
    } else if (jump < -2) {
      score -= 0.1;
    }
  }

  return Number(Math.max(0, Math.min(1, score)).toFixed(2));
}

function computeContentClarityScore(
  text: string,
  contentHtml: string,
  title: string,
): number {
  const paragraphs = contentHtml.match(/<p\b/gi)?.length ?? 0;
  const headings = contentHtml.match(/<h[1-6]\b/gi)?.length ?? 0;
  const sentences = text
    .split(/[.!?]+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const avgSentenceWords = sentences.length === 0
    ? 0
    : wordCount(text) / sentences.length;

  let score = 0;
  if (title) {
    score += 0.15;
  }
  if (paragraphs >= 2) {
    score += 0.25;
  } else if (paragraphs === 1) {
    score += 0.1;
  }
  if (headings >= 1) {
    score += 0.2;
  }
  if (avgSentenceWords >= 8 && avgSentenceWords <= 30) {
    score += 0.25;
  } else if (avgSentenceWords > 0) {
    score += 0.1;
  }
  if (wordCount(text) >= 150) {
    score += 0.15;
  } else if (wordCount(text) >= 60) {
    score += 0.08;
  }

  return Number(Math.max(0, Math.min(1, score)).toFixed(2));
}

function computeLlmReadiness(
  extractedWordCount: number,
  textDensity: number,
  headingHierarchyScore: number,
  contentClarityScore: number,
): number {
  const wordCoverage = extractedWordCount >= 250
    ? 1
    : extractedWordCount >= 120
      ? 0.8
      : extractedWordCount >= 60
        ? 0.55
        : extractedWordCount >= 25
          ? 0.3
          : 0.1;
  const densityScore = textDensity >= 35
    ? 1
    : textDensity >= 20
      ? 0.75
      : textDensity >= 10
        ? 0.5
        : 0.2;

  const score = (wordCoverage * 0.35) +
    (densityScore * 0.2) +
    (headingHierarchyScore * 0.2) +
    (contentClarityScore * 0.25);

  return Number(Math.max(0, Math.min(1, score)).toFixed(2));
}

export async function runContentExtractionCheck(
  context: CheckContext,
): Promise<CheckResult> {
  const html = context.baseSnapshot?.body ?? "";
  if (!html) {
    return {
      status: "FAIL",
      reason: "No HTML content available for extraction",
      metadata: {},
    };
  }

  const cleanedHtml = stripBoilerplate(html);
  const boilerplateText = stripTags(html);
  const { extractedHtml, source } = extractPreferredContent(html);
  const text = stripTags(extractedHtml);
  const words = wordCount(text);
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? "";
  const description =
    html.match(
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i,
    )?.[1] ?? "";
  const textDensity = computeTextDensity(text, extractedHtml);
  const headingHierarchyScore = computeHeadingHierarchyScore(extractedHtml);
  const contentClarityScore = computeContentClarityScore(text, extractedHtml, title);
  const llmReadiness = computeLlmReadiness(
    words,
    textDensity,
    headingHierarchyScore,
    contentClarityScore,
  );

  const status = llmReadiness >= 0.75
    ? "PASS"
    : llmReadiness >= 0.45
      ? "WARNING"
      : "FAIL";
  const reason =
    status === "PASS"
      ? "Main content was extracted cleanly and appears LLM-ready"
      : status === "WARNING"
        ? "Some meaningful content was extracted, but structure or clarity is limited"
        : "Content extraction quality is too weak for reliable LLM parsing";

  return {
    status,
    reason,
    metadata: {
      normalizedScore: llmReadiness,
      extractionSource: source,
      extractedWordCount: words,
      extractedCharacterCount: text.length,
      boilerplateStrippedCharacterCount: Math.max(0, boilerplateText.length - stripTags(cleanedHtml).length),
      textDensity,
      headingHierarchyScore,
      contentClarityScore,
      llmReadiness,
      title: title || null,
      metaDescription: description || null,
      textSample: clip(text, 220),
    },
  };
}
