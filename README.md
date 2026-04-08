# GEO & AI Crawlability Audit

A tool that answers: **"Can AI engines find, understand, and cite my page?"**

GEO (Generative Engine Optimization) = traditional SEO crawlability **+** structured signals that tell AI engines *what* your content is and *why* it should be cited. This tool covers both layers with 16 checks across 7 categories.

---

## What Was Removed and Why (v1 → v2)

### ❌ HTML Parsability Check
The HTML5 spec was designed for fault-tolerant parsing. Every crawler handles missing `<html>`/`<body>` tags, broken markup, and mismatched angle brackets gracefully. This produced noise, not signal.

### ❌ Original LLM Readiness Formula
- **Heading hierarchy penalty** (H1→H3 skip): LLMs embed semantics via transformers — skipped heading levels don't impair extraction.
- **8–30 word sentence rule**: Completely invented. No research backing from OpenAI, Anthropic, Google, or NLP literature.
- **Text density formula**: Word count per block element is meaningless to how transformers process text.

### ❌ Jaccard Similarity for Bot Comparison
Produced false positives — a page adding a "please enable JS" banner for bots registered as "divergent" even with identical content. Replaced with word-token overlap (Jaccard on content words, not raw HTML).

### ❌ Response Time as a Scored Metric
Relevant for Googlebot crawl budget, not for offline AI training crawlers (GPTBot, ClaudeBot). Demoted to informational metadata.

---

## What Was Added (v2 → v2)

### ✅ Meta Robots + X-Robots-Tag
`<meta name="robots" content="noindex">` overrides robots.txt for most crawlers. The original tool could show robots.txt PASS while the page simultaneously blocks all AI indexing via HTML. Also checks bot-specific meta tags and X-Robots-Tag HTTP headers.

### ✅ Canonical Tag
`<link rel="canonical">` tells crawlers which URL owns the content. If canonicalized to a different URL, AI crawlers treat the page as a duplicate and attribute its content elsewhere.

### ✅ Structured Data / Schema.org (was 0% weight → 20%)
The single biggest missing piece. JSON-LD schema detection, type recognition, required field validation, @context validation, title match checking.

### ✅ Open Graph Completeness
og:title, og:description, og:image, og:type, og:url, twitter:card — AI citation quality depends on these.

### ✅ Sitemap Presence
Basic sitemap existence + URL inclusion check.

### ✅ Content Freshness
JSON-LD dateModified → Last-Modified header → OG article dates → `<time>` element.

### ✅ 7-Bot Simulation (was 3 → 7)
Added ClaudeBot, Bingbot, Applebot, Meta-ExternalAgent.

### ✅ Crawl-Delay Detection
robots.txt `Crawl-delay` directive now parsed and flagged.

### ✅ Redirect Chain Analysis
Counts hops, classifies 301 vs 302, flags chains > 2 hops.

---

## What Was Added (v2 → v3) — The Competitive Layer

### ✅ Proper robots.txt Wildcard Pattern Matching
**The gap:** The original parser used `startsWith()`, which silently misses patterns like `Disallow: /*.php$`, `Disallow: /search?q=*`, or `Disallow: /wp-admin/*`. Sites with wildcard-based bot blocks appeared as PASS.

**The fix:** Full Google robots.txt spec implementation — `*` converted to regex `.*`, `$` treated as end anchor. Specific user-agent rules take precedence over `*` wildcard groups. Allow beats Disallow on equal specificity.

### ✅ E-E-A-T Signals Check (new, part of 20% Structured Data weight)
Google's Experience, Expertise, Authoritativeness, Trustworthiness signals — what determines whether AI Overviews trust and cite your content.

Checks:
- Author schema (`Person` with name)
- Author `sameAs` social profiles (LinkedIn, GitHub, ORCID, etc.)
- HTML byline / `itemprop="author"` markup
- Organization schema with name, logo, contactPoint
- Publisher declared in Article schema
- Links to About / Team / Contact pages
- External citations to authoritative sources (.gov, .edu, Wikipedia, PubMed, Nature, Reuters, AP)

Weighted scoring across 11 signals, no arbitrary thresholds — each signal has a research-justified weight.

### ✅ Internal Link Depth (new, part of 18% Crawl Signals)
**The gap:** A page can have perfect robots.txt, canonical, and structured data — and still almost never get crawled if it's orphaned.

BFS from homepage up to depth 3, max 20 pages checked:
- Depth 1 (linked from homepage): PASS — excellent crawlability
- Depth 2: PASS — good crawlability
- Depth 3: WARNING — add to navigation or sitemap
- Not found within depth 3: FAIL — likely orphaned

### ✅ llms.txt / ai.txt Check (new, part of 15% Bot Access)
The emerging standard for AI-specific site instructions (similar to robots.txt but for LLMs). Checks `/llms.txt`, `/ai.txt`, `/llms-full.txt`.

Parses the Markdown-based llms.txt format:
- Title, description, sections, content links
- Explicit block/allow directives
- Quality scoring: having the file + how complete it is

Being the first mainstream tool to check this is a genuine competitive differentiator.

### ✅ Enhanced Sitemap Quality Validation (upgraded)
Beyond existence and URL inclusion:
- Total URL count (flags if ≥ 50,000 — per-file limit)
- % of URLs with `<lastmod>` dates (< 50% = warning)
- Newest and oldest lastmod dates
- `<changefreq>` presence
- Nested sitemap index support (checks up to 6 nested sitemaps)

Now returns FAIL (not just WARNING) when no sitemap exists, since absence is a real crawlability barrier.

### ✅ Core Web Vitals via Playwright (new, part of 10% Rendering)
Googlebot uses CWV for crawl quality and AI Overview inclusion decisions. Measured via real Chromium rendering:

| Metric | Good | Needs Work | Poor |
|---|---|---|---|
| LCP (Largest Contentful Paint) | ≤ 2500ms | ≤ 4000ms | > 4000ms |
| CLS (Cumulative Layout Shift) | ≤ 0.1 | ≤ 0.25 | > 0.25 |
| FCP (First Contentful Paint) | ≤ 1800ms | ≤ 3000ms | > 3000ms |
| TTFB (Time to First Byte) | ≤ 800ms | ≤ 1800ms | > 1800ms |
| TBT (Total Blocking Time) | ≤ 200ms | ≤ 600ms | > 600ms |

LCP weighted 30%, CLS 25% of the CWV score (matching Google's primacy). Graceful fallback when Playwright unavailable.

### ✅ Multi-Page Site Health Sample (new, 12% weight)
Single-URL analysis misses site-wide issues. Samples homepage + up to 4 sitemap URLs and reports:
- % of pages with JSON-LD
- % of pages with self-referencing canonical
- % of pages with noindex (any noindex > 0% on a live site = problem)
- Error pages (4xx/5xx) in the sample
- Missing title tags

This catches sitewide plugin misconfiguration, CDN rules that noindex staging content in production, and canonical bugs that only show on certain URL patterns.

### ✅ Content-Type Aware Freshness Scoring (upgraded)
**The gap:** The original formula penalized all pages equally for age. A 3-year-old "What is HTTPS?" guide should not be penalized the same as a 3-year-old news article.

Now detects content mode from schema type:
- **News** (NewsArticle, LiveBlogPosting): strict — > 30 days → WARNING
- **Evergreen** (HowTo, FAQPage, Product, Organization, WebSite): lenient — up to 2 years still PASS
- **Article** (Article, BlogPosting): moderate
- **Unknown**: moderate, with softer thresholds

---

## Scoring Architecture (v3)

| Category | Weight | Checks |
|---|---|---|
| Fetchability | 10% | Fetchability + redirect chain |
| Bot Access | 15% | robots.txt (wildcard), bot simulation (7 bots), llms.txt |
| Crawl Signals | 18% | Meta robots, canonical, sitemap quality, internal link depth |
| Structured Data & Authority | 20% | JSON-LD quality (60%), E-E-A-T signals (40%) |
| Rendering & Performance | 10% | JS rendering (55%), Core Web Vitals (45%) |
| Content Quality | 15% | Extraction (35%), Open Graph (30%), Freshness (35%) |
| Site Health | 12% | Multi-page sample |

**Classification:**
- 80–100: Excellent — AI engines can find, understand, and cite your content
- 60–79: Good — minor gaps, unlikely to block AI visibility
- 40–59: Risky — at least one significant barrier to AI indexing or citation
- 0–39: Broken — fundamental issues preventing AI parsing

---

## Run

```bash
npm start
```
Open: `http://localhost:3000`

## API

```bash
curl -X POST http://localhost:3000/analyze \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com/page"}'
```

## All 16 Checks

| Check | Category | Notes |
|---|---|---|
| Fetchability | Fetchability | DNS, TLS, HTTP, redirect chain |
| Robots.txt | Bot Access | Full wildcard + $ anchor support |
| Bot Simulation | Bot Access | 7 bots: GPT, Claude, Perplexity, Google, Bing, Apple, Meta |
| llms.txt / ai.txt | Bot Access | Emerging AI-specific standard |
| Meta Robots | Crawl Signals | HTML + X-Robots-Tag header |
| Canonical Tag | Crawl Signals | Self-referencing vs. redirected away |
| Sitemap Quality | Crawl Signals | Count, lastmod %, URL inclusion |
| Internal Link Depth | Crawl Signals | BFS from homepage, depth 1-3 |
| Structured Data | Structured Data & Authority | JSON-LD type + field quality |
| E-E-A-T Signals | Structured Data & Authority | 11 weighted signals |
| JS Rendering | Rendering & Performance | Raw vs. rendered delta |
| Core Web Vitals | Rendering & Performance | LCP, CLS, FCP, TTFB, TBT |
| Content Extraction | Content Quality | Word count, extraction source |
| Open Graph | Content Quality | og:title/desc/image/type/url + twitter:card |
| Content Freshness | Content Quality | Content-type aware scoring |
| Site Health Sample | Site Health | Homepage + 4 sitemap URLs |

## Notes

- Runs with `tsx` (TypeScript, no compile step).
- Playwright used for JS rendering + Core Web Vitals; falls back gracefully when unavailable.
- Server timeout configurable via `ANALYZE_TIMEOUT_MS` env var (default: 30s).
- `vercel.json` installs only production deps for Vercel deploys.
