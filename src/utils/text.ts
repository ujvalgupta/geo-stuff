export function stripTags(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export function stripBoilerplate(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<(nav|footer|aside|form)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<header\b[^>]*>[\s\S]*?<\/header>/gi, " ")
    .replace(/<[^>]+\b(role|aria-label|id|class)=["'][^"']*(nav|footer|menu|sidebar|breadcrumb|subscribe|newsletter|related|share|social)[^"']*["'][^>]*>[\s\S]*?<\/[^>]+>/gi, " ");
}

export function extractPreferredContent(html: string): {
  extractedHtml: string;
  source: string;
} {
  const cleaned = stripBoilerplate(html);
  const selectors = [
    { source: "article", regex: /<article\b[^>]*>([\s\S]*?)<\/article>/i },
    { source: "main", regex: /<main\b[^>]*>([\s\S]*?)<\/main>/i },
    { source: "role=main", regex: /<[^>]+\brole=["']main["'][^>]*>([\s\S]*?)<\/[^>]+>/i },
    { source: "body", regex: /<body\b[^>]*>([\s\S]*?)<\/body>/i },
  ];

  for (const selector of selectors) {
    const match = cleaned.match(selector.regex);
    if (match?.[1]?.trim()) {
      return {
        extractedHtml: match[1],
        source: selector.source,
      };
    }
  }

  return {
    extractedHtml: cleaned,
    source: "document",
  };
}

export function wordCount(text: string): number {
  const normalized = text.trim();
  if (!normalized) {
    return 0;
  }

  return normalized.split(/\s+/).length;
}

export function clip(text: string, max = 180): string {
  return text.length <= max ? text : `${text.slice(0, max - 3)}...`;
}
