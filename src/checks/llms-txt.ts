import type { CheckContext, CheckResult } from "../types.js";
import { fetchText } from "../utils/http.js";

interface LlmsFile {
  path: string;
  found: boolean;
  statusCode: number | null;
  content: string | null;
  size: number;
}

interface ParsedLlmsRule {
  directive: string;
  value: string;
}

/**
 * Parses llms.txt content.
 * The emerging llms.txt spec is Markdown-based:
 *   # Site Name
 *   > Brief description
 *
 *   ## Section
 *   - [Label](url): description
 *
 * We extract key signals: title, description, allowed/blocked paths,
 * and any explicit AI-related directives.
 */
function parseLlmsTxt(content: string): {
  title: string | null;
  description: string | null;
  sections: string[];
  links: Array<{ label: string; url: string; description?: string }>;
  hasBlockRules: boolean;
  hasAllowRules: boolean;
  rules: ParsedLlmsRule[];
} {
  const lines = content.split(/\r?\n/);
  let title: string | null = null;
  let description: string | null = null;
  const sections: string[] = [];
  const links: Array<{ label: string; url: string; description?: string }> = [];
  const rules: ParsedLlmsRule[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // H1 = site title
    if (/^#\s+/.test(trimmed) && !title) {
      title = trimmed.replace(/^#+\s*/, "");
      continue;
    }

    // H2/H3 = sections
    if (/^#{2,3}\s+/.test(trimmed)) {
      sections.push(trimmed.replace(/^#+\s*/, ""));
      continue;
    }

    // Blockquote = description
    if (trimmed.startsWith(">") && !description) {
      description = trimmed.slice(1).trim();
      continue;
    }

    // Markdown links in list items: - [Label](url): description
    const linkMatch = trimmed.match(/^[-*]\s+\[([^\]]+)\]\(([^)]+)\)(?::\s*(.+))?/);
    if (linkMatch) {
      links.push({ label: linkMatch[1], url: linkMatch[2], description: linkMatch[3] });
      continue;
    }

    // Key: value directives (robots.txt style additions)
    const directiveMatch = trimmed.match(/^(\w[\w-]*):\s*(.+)/);
    if (directiveMatch) {
      rules.push({ directive: directiveMatch[1].toLowerCase(), value: directiveMatch[2] });
    }
  }

  const blockKeywords = ["noindex", "disallow", "block", "deny", "opt-out", "no-ai"];
  const allowKeywords = ["allow", "index", "permit", "opt-in", "welcome"];
  const allText = content.toLowerCase();

  const hasBlockRules =
    rules.some((r) => blockKeywords.some((k) => r.directive.includes(k) || r.value.includes(k))) ||
    blockKeywords.some((k) => allText.includes(k));

  const hasAllowRules =
    rules.some((r) => allowKeywords.some((k) => r.directive.includes(k))) ||
    allowKeywords.some((k) => allText.includes(k));

  return { title, description, sections, links, hasBlockRules, hasAllowRules, rules };
}

export async function runLlmsTxtCheck(
  context: CheckContext,
): Promise<CheckResult> {
  const origin = context.normalizedUrl.origin;

  const filePaths = ["/llms.txt", "/ai.txt", "/llms-full.txt"];

  const results = await Promise.all(
    filePaths.map(async (path): Promise<LlmsFile> => {
      const url = `${origin}${path}`;
      const resp = await fetchText(url);
      const found = !resp.fetchError && resp.statusCode === 200 && !!resp.body;
      return {
        path,
        found,
        statusCode: resp.statusCode,
        content: found ? resp.body : null,
        size: resp.body?.length ?? 0,
      };
    }),
  );

  const foundFiles = results.filter((r) => r.found);

  if (foundFiles.length === 0) {
    return {
      status: "WARNING",
      reason: "No llms.txt or ai.txt found — this emerging standard helps AI engines understand your site's content structure",
      metadata: {
        normalizedScore: 0.4,
        filesChecked: filePaths,
        foundFiles: [],
        recommendation: "Consider adding /llms.txt — see llmstxt.org for the spec. It signals AI-readiness and can improve citation quality.",
      },
    };
  }

  const primary = foundFiles[0];
  const parsed = primary.content ? parseLlmsTxt(primary.content) : null;

  let score: number;
  let status: "PASS" | "WARNING" | "FAIL";
  let reason: string;

  if (parsed?.hasBlockRules && !parsed.hasAllowRules) {
    score = 0.2;
    status = "WARNING";
    reason = `${primary.path} found but contains restrictive directives — AI engines may be excluded`;
  } else if (parsed) {
    const quality =
      (parsed.title ? 0.2 : 0) +
      (parsed.description ? 0.2 : 0) +
      (parsed.sections.length > 0 ? 0.2 : 0) +
      (parsed.links.length > 0 ? 0.3 : 0) +
      (!parsed.hasBlockRules ? 0.1 : 0);

    score = 0.5 + quality * 0.5; // base 0.5 for having the file + quality bonus
    score = Number(Math.min(1, score).toFixed(2));
    status = score >= 0.75 ? "PASS" : "WARNING";
    reason =
      status === "PASS"
        ? `${primary.path} found and well-structured (${parsed.links.length} links, ${parsed.sections.length} sections)`
        : `${primary.path} found but could be more detailed — add title, description, and content links`;
  } else {
    score = 0.55;
    status = "WARNING";
    reason = `${primary.path} found but content could not be parsed`;
  }

  return {
    status,
    reason,
    metadata: {
      normalizedScore: score,
      foundFiles: foundFiles.map((f) => f.path),
      primaryFile: primary.path,
      fileSize: primary.size,
      parsed: parsed
        ? {
            title: parsed.title,
            description: parsed.description,
            sectionCount: parsed.sections.length,
            sections: parsed.sections,
            linkCount: parsed.links.length,
            hasBlockRules: parsed.hasBlockRules,
            hasAllowRules: parsed.hasAllowRules,
            rules: parsed.rules,
          }
        : null,
    },
  };
}
