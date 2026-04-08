import type { CheckContext, CheckResult } from "../types.js";

interface EeatSignal {
  signal: string;
  found: boolean;
  detail?: string;
  weight: number;
}

const AUTHORITATIVE_DOMAINS = [
  ".gov", ".edu", ".ac.uk", ".ac.au",
  "wikipedia.org", "reuters.com", "apnews.com",
  "pubmed.ncbi.nlm.nih.gov", "scholar.google.com",
  "nature.com", "sciencedirect.com", "ncbi.nlm.nih.gov",
  "who.int", "cdc.gov", "nih.gov",
];

const SOCIAL_DOMAINS = [
  "linkedin.com", "twitter.com", "x.com", "github.com",
  "facebook.com", "instagram.com", "youtube.com",
  "orcid.org", "researchgate.net",
];

function extractJsonLdObjects(html: string): Record<string, unknown>[] {
  const results: Record<string, unknown>[] = [];
  const regex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    try {
      const parsed: unknown = JSON.parse(match[1]);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of items) {
        if (typeof item === "object" && item !== null) {
          results.push(item as Record<string, unknown>);
        }
      }
    } catch { /* skip invalid */ }
  }
  return results;
}

function getSchemaType(obj: Record<string, unknown>): string {
  const t = obj["@type"];
  if (typeof t === "string") return t;
  if (Array.isArray(t) && typeof t[0] === "string") return t[0] as string;
  return "";
}

function deepFind(obj: unknown, key: string): unknown {
  if (typeof obj !== "object" || obj === null) return undefined;
  const rec = obj as Record<string, unknown>;
  if (key in rec) return rec[key];
  for (const v of Object.values(rec)) {
    const found = deepFind(v, key);
    if (found !== undefined) return found;
  }
  return undefined;
}

function extractAllLinks(html: string): string[] {
  const links: string[] = [];
  const regex = /href=["']([^"'#\s]+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    links.push(match[1]);
  }
  return links;
}

function hasInternalPageLink(links: string[], ...slugs: string[]): boolean {
  return links.some((l) =>
    slugs.some((s) => l.toLowerCase().includes(s)),
  );
}

function countAuthoritativeExternalLinks(links: string[]): number {
  return links.filter((l) => {
    try {
      const u = new URL(l);
      return AUTHORITATIVE_DOMAINS.some((d) => u.hostname.endsWith(d));
    } catch { return false; }
  }).length;
}

function extractSameAsLinks(schemas: Record<string, unknown>[]): string[] {
  const links: string[] = [];
  for (const s of schemas) {
    const sameAs = deepFind(s, "sameAs");
    if (typeof sameAs === "string") links.push(sameAs);
    if (Array.isArray(sameAs)) links.push(...sameAs.filter((v): v is string => typeof v === "string"));
  }
  return links;
}

export async function runEeatSignalsCheck(
  context: CheckContext,
): Promise<CheckResult> {
  const html = context.baseSnapshot?.body ?? "";

  if (!html) {
    return {
      status: "FAIL",
      reason: "No HTML available to evaluate E-E-A-T signals",
      metadata: { normalizedScore: 0, signals: [] },
    };
  }

  const schemas = extractJsonLdObjects(html);
  const links = extractAllLinks(html);
  const sameAsLinks = extractSameAsLinks(schemas);

  const schemaTypes = schemas.map(getSchemaType);
  const hasArticleType = schemaTypes.some((t) =>
    ["Article", "NewsArticle", "BlogPosting", "TechArticle"].includes(t),
  );
  const hasOrgSchema = schemas.some((s) =>
    ["Organization", "LocalBusiness", "Corporation"].includes(getSchemaType(s)),
  );
  const hasPersonSchema = schemas.some((s) =>
    ["Person"].includes(getSchemaType(s)),
  );

  // Author signals
  const authorInSchema = schemas.some((s) => {
    const author = s["author"] ?? deepFind(s, "author");
    return author != null;
  });
  const authorHasName = schemas.some((s) => {
    const author = deepFind(s, "author");
    if (typeof author === "object" && author !== null) {
      return !!(author as Record<string, unknown>)["name"];
    }
    return typeof author === "string" && author.length > 0;
  });

  // Social profiles via sameAs
  const hasSocialProfiles = sameAsLinks.some((l) =>
    SOCIAL_DOMAINS.some((d) => l.includes(d)),
  );

  // Organization signals
  const orgHasName = schemas.some((s) => {
    const type = getSchemaType(s);
    return (
      ["Organization", "LocalBusiness", "Corporation"].includes(type) &&
      typeof s["name"] === "string" && s["name"].length > 0
    );
  });
  const orgHasLogo = schemas.some((s) => deepFind(s, "logo") != null);
  const orgHasContact = schemas.some((s) =>
    deepFind(s, "contactPoint") != null || deepFind(s, "email") != null,
  );

  // Publisher signal
  const hasPublisher = schemas.some((s) => deepFind(s, "publisher") != null);

  // About / Contact / Team page links
  const hasAboutLink = hasInternalPageLink(links, "/about", "/about-us", "/team", "/who-we-are");
  const hasContactLink = hasInternalPageLink(links, "/contact", "/contact-us", "/get-in-touch");

  // External authoritative citations
  const authLinkCount = countAuthoritativeExternalLinks(links);
  const hasAuthCitations = authLinkCount >= 1;

  // Byline in HTML (fallback when no schema)
  const hasByline =
    /(<[^>]+(class|itemprop)=["'][^"']*(author|byline|writer)[^"']*["'][^>]*>)/i.test(html) ||
    /<span[^>]*itemprop=["']author["'][^>]*>/i.test(html);

  // Build signals list
  const signals: EeatSignal[] = [
    { signal: "Author in schema", found: authorInSchema, weight: 12 },
    { signal: "Author name present", found: authorHasName, weight: 10 },
    { signal: "Author social profiles (sameAs)", found: hasSocialProfiles, weight: 10 },
    { signal: "HTML byline / author markup", found: hasByline, weight: 6 },
    { signal: "Organization schema", found: hasOrgSchema || orgHasName, weight: 10 },
    { signal: "Organization logo", found: orgHasLogo, weight: 6 },
    { signal: "Organization contact info", found: orgHasContact, weight: 8 },
    { signal: "Publisher declared in Article schema", found: hasPublisher, weight: 8 },
    { signal: "About / Team page linked", found: hasAboutLink, weight: 10 },
    { signal: "Contact page linked", found: hasContactLink, weight: 8 },
    { signal: "Authoritative external citations", found: hasAuthCitations, weight: 12,
      detail: authLinkCount > 0 ? `${authLinkCount} link${authLinkCount > 1 ? "s" : ""} to authoritative sources` : undefined },
  ];

  const totalWeight = signals.reduce((s, sig) => s + sig.weight, 0);
  const earnedWeight = signals.filter((s) => s.found).reduce((s, sig) => s + sig.weight, 0);
  const score = Number((earnedWeight / totalWeight).toFixed(2));

  const foundSignals = signals.filter((s) => s.found).map((s) => s.signal);
  const missingSignals = signals.filter((s) => !s.found).map((s) => s.signal);

  const status = score >= 0.65 ? "PASS" : score >= 0.35 ? "WARNING" : "FAIL";

  const reason =
    status === "PASS"
      ? `Strong E-E-A-T signals: ${foundSignals.slice(0, 3).join(", ")}${foundSignals.length > 3 ? ` +${foundSignals.length - 3} more` : ""}`
      : status === "WARNING"
        ? `Partial E-E-A-T — missing: ${missingSignals.slice(0, 3).join(", ")}${missingSignals.length > 3 ? ` +${missingSignals.length - 3} more` : ""}`
        : `Weak E-E-A-T — AI engines cannot verify authorship or authority of this content`;

  return {
    status,
    reason,
    metadata: {
      normalizedScore: score,
      foundCount: foundSignals.length,
      totalSignals: signals.length,
      foundSignals,
      missingSignals,
      signals,
      authoritativeLinkCount: authLinkCount,
      hasSocialProfiles,
      hasAuthorSchema: authorInSchema,
      hasOrgSchema: hasOrgSchema || orgHasName,
    },
  };
}
