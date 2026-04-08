import type { CheckContext, CheckResult } from "../types.js";

const BLOCKING_DIRECTIVES = ["noindex", "nosnippet", "noarchive", "none"];
const AI_BOT_META_NAMES = ["gptbot", "claudebot", "perplexitybot", "bingbot", "applebot"];

interface MetaRobotsDirectives {
  source: string;
  rawContent: string;
  directives: string[];
  blocks: string[];
}

function parseDirectives(content: string): string[] {
  return content
    .toLowerCase()
    .split(",")
    .map((d) => d.trim())
    .filter(Boolean);
}

function getBlockingDirectives(directives: string[]): string[] {
  return directives.filter((d) => BLOCKING_DIRECTIVES.some((b) => d.startsWith(b)));
}

export async function runMetaRobotsCheck(
  context: CheckContext,
): Promise<CheckResult> {
  const html = context.baseSnapshot?.body ?? "";
  const headers = context.baseSnapshot?.headers ?? {};

  const found: MetaRobotsDirectives[] = [];

  // Check X-Robots-Tag HTTP header (can be comma-separated or multi-value)
  const xRobotsTag = headers["x-robots-tag"];
  if (xRobotsTag) {
    const directives = parseDirectives(xRobotsTag);
    const blocks = getBlockingDirectives(directives);
    found.push({
      source: "X-Robots-Tag header",
      rawContent: xRobotsTag,
      directives,
      blocks,
    });
  }

  // Check all <meta name="robots"> / <meta name="googlebot"> / <meta name="GPTBot"> etc.
  const metaRegex = /<meta\s+[^>]*name=["']([^"']+)["'][^>]*content=["']([^"']+)["'][^>]*>/gi;
  let match: RegExpExecArray | null;

  while ((match = metaRegex.exec(html)) !== null) {
    const name = match[1].toLowerCase();
    const content = match[2];

    const isRobotsTag =
      name === "robots" ||
      name === "googlebot" ||
      AI_BOT_META_NAMES.includes(name);

    if (isRobotsTag) {
      const directives = parseDirectives(content);
      const blocks = getBlockingDirectives(directives);
      found.push({
        source: `<meta name="${match[1]}">`,
        rawContent: content,
        directives,
        blocks,
      });
    }
  }

  // Also catch reversed attribute order: content first, name second
  const metaRegexReversed = /<meta\s+[^>]*content=["']([^"']+)["'][^>]*name=["']([^"']+)["'][^>]*>/gi;
  while ((match = metaRegexReversed.exec(html)) !== null) {
    const name = match[2].toLowerCase();
    const content = match[1];

    const isRobotsTag =
      name === "robots" ||
      name === "googlebot" ||
      AI_BOT_META_NAMES.includes(name);

    if (isRobotsTag) {
      // Avoid duplicates from the first pass
      const alreadyFound = found.some((f) => f.rawContent === content && f.source.includes(match![2]));
      if (!alreadyFound) {
        const directives = parseDirectives(content);
        const blocks = getBlockingDirectives(directives);
        found.push({
          source: `<meta name="${match[2]}">`,
          rawContent: content,
          directives,
          blocks,
        });
      }
    }
  }

  const allBlocking = found.filter((f) => f.blocks.length > 0);
  const allBlockingDirectives = allBlocking.flatMap((f) =>
    f.blocks.map((b) => `${b} (via ${f.source})`),
  );

  const hasNoindex = allBlocking.some((f) => f.blocks.some((b) => b === "noindex" || b === "none"));
  const hasNosnippet = allBlocking.some((f) => f.blocks.some((b) => b === "nosnippet"));

  let status: "PASS" | "WARNING" | "FAIL";
  let reason: string;

  if (found.length === 0) {
    status = "PASS";
    reason = "No meta robots or X-Robots-Tag directives found — crawlers have full access";
  } else if (hasNoindex) {
    status = "FAIL";
    reason = `Page is set to noindex — AI crawlers will not index this page`;
  } else if (hasNosnippet) {
    status = "WARNING";
    reason = "nosnippet directive found — AI engines may not use this page for answer generation";
  } else if (allBlocking.length > 0) {
    status = "WARNING";
    reason = `Restrictive directives found: ${allBlockingDirectives.join(", ")}`;
  } else {
    status = "PASS";
    reason = "Meta robots directives found but none restrict AI crawler access";
  }

  return {
    status,
    reason,
    metadata: {
      normalizedScore: status === "PASS" ? 1 : status === "WARNING" ? 0.5 : 0,
      tagsFound: found.length,
      blockingDirectivesFound: allBlockingDirectives,
      details: found,
    },
  };
}
