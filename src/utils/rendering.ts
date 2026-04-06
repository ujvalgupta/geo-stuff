import { stripTags } from "./text.js";

export interface RenderComparison {
  rawTextLength: number;
  renderedTextLength: number;
  rawDomNodeCount: number;
  renderedDomNodeCount: number;
  renderDependencyScore: number;
  heavilyJsDependent: boolean;
  available: boolean;
  error?: string;
}

function countHtmlNodes(html: string): number {
  const sanitized = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ");
  const matches = sanitized.match(/<([a-zA-Z][^\s/>]*)\b[^>]*>/g) ?? [];
  return matches.length;
}

function calculateRenderDependencyScore(
  rawTextLength: number,
  renderedTextLength: number,
  rawDomNodeCount: number,
  renderedDomNodeCount: number,
): number {
  const textGain = renderedTextLength <= rawTextLength
    ? 0
    : (renderedTextLength - rawTextLength) / Math.max(renderedTextLength, 1);
  const nodeGain = renderedDomNodeCount <= rawDomNodeCount
    ? 0
    : (renderedDomNodeCount - rawDomNodeCount) / Math.max(renderedDomNodeCount, 1);

  return Number(Math.min(1, (textGain * 0.7) + (nodeGain * 0.3)).toFixed(2));
}

export async function compareRawAndRenderedPage(
  url: string,
  rawHtml: string,
): Promise<RenderComparison> {
  const rawTextLength = stripTags(rawHtml).length;
  const rawDomNodeCount = countHtmlNodes(rawHtml);

  try {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({
      headless: true,
    });

    try {
      const page = await browser.newPage();
      await page.goto(url, {
        waitUntil: "networkidle",
        timeout: 15000,
      });

      const rendered = await page.evaluate(() => {
        const text = document.body?.innerText?.replace(/\s+/g, " ").trim() ?? "";
        const nodeCount = document.querySelectorAll("*").length;
        return {
          textLength: text.length,
          domNodeCount: nodeCount,
        };
      });

      const renderDependencyScore = calculateRenderDependencyScore(
        rawTextLength,
        rendered.textLength,
        rawDomNodeCount,
        rendered.domNodeCount,
      );

      return {
        rawTextLength,
        renderedTextLength: rendered.textLength,
        rawDomNodeCount,
        renderedDomNodeCount: rendered.domNodeCount,
        renderDependencyScore,
        heavilyJsDependent: renderDependencyScore >= 0.45,
        available: true,
      };
    } finally {
      await browser.close();
    }
  } catch (error) {
    return {
      rawTextLength,
      renderedTextLength: rawTextLength,
      rawDomNodeCount,
      renderedDomNodeCount: rawDomNodeCount,
      renderDependencyScore: 0,
      heavilyJsDependent: false,
      available: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
