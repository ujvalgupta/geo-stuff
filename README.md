# GEO & AI Crawlability Audit

A tool that answers: **"Can AI engines find, understand, and cite my page?"**

GEO (Generative Engine Optimization) = traditional SEO crawlability **+** structured signals that tell AI engines *what* your content is and *why* it should be cited. This tool covers both layers.

---

## Analysis Notes & Strategy

### What Was Removed and Why

#### ❌ HTML Parsability Check — Deleted
The HTML5 parsing spec was designed for fault-tolerant parsing. Every crawler (Googlebot, GPTBot, ClaudeBot, PerplexityBot) uses a robust parser that handles missing `<html>`/`<body>` tags, broken markup, and mismatched angle brackets gracefully. No real-world page fails to get crawled because of a structural HTML issue. This check produced noise, not signal.

#### ❌ Original LLM Readiness Formula — Replaced
The original formula penalized things with no research backing:
- **Heading hierarchy penalty** (H1→H3 skip): LLMs embed semantics via transformers — they don't walk DOM trees. A skipped heading level does not impair extraction.
- **8–30 word sentence rule**: Completely invented. Not referenced in any published work from OpenAI, Anthropic, Google, or academic NLP literature.
- **Text density (words per block element)**: A page with one `<div>` and 500 words scores the same to an LLM as 20 `<p>` tags and 500 words.
- **Arbitrary `contentClarityScore` weights** (0.15, 0.25, 0.20...): Intuited, not derived.

**Replaced with:** Word count, extraction success, metadata presence, and unique content ratio — signals with actual semantic meaning.

#### ❌ Jaccard Similarity for Bot Comparison — Replaced
Token-overlap comparison produced false positives: a page that adds a "please enable JavaScript" banner for bots registers as "divergent" even if 100% of the real content is identical. The `>=20%` response length threshold was also arbitrary — lazy-loaded images alone can shift response size by 20%+ with zero content difference.

#### ❌ Response Time as a Scored Metric — Demoted to Informational
Response time matters for Googlebot crawl budget, not for AI training crawlers (GPTBot, ClaudeBot) which are offline batch processes. Now reported in metadata but does not affect score.

---

### What Was Added and Why

#### ✅ Meta Robots + X-Robots-Tag Check (Critical — was a false-green gap)
`<meta name="robots" content="noindex">` in HTML **overrides robots.txt** for most crawlers. The original tool could show robots.txt as fully open while the page simultaneously blocks all AI indexing via an HTML tag. Now checks:
- `<meta name="robots">`, `<meta name="googlebot">`, `<meta name="GPTBot">` etc.
- `X-Robots-Tag` HTTP response header (used by Cloudflare rules, WordPress plugins, CDNs)
- Specific directives: `noindex`, `nosnippet`, `noarchive` — each has different AI-citation implications

#### ✅ Canonical Tag Check (Critical)
`<link rel="canonical">` tells crawlers which URL "owns" a piece of content. If a page canonicalizes to a different URL, AI crawlers treat the analyzed page as a duplicate — they either skip it or attribute its content elsewhere. Every SEO practitioner's first question when a page isn't appearing in AI answers: "is it canonicalized away?"

#### ✅ Structured Data / Schema.org Quality (25% weight — was 0%)
This was the single biggest missing piece. JSON-LD schema is how Google AI Overviews, Perplexity, and answer engines understand **what** a piece of content is. Without schema, the crawler guesses context from prose. With it, the engine knows it's working with an `Article`, `FAQPage`, `Product`, `HowTo`, etc.

This check:
- Finds all `<script type="application/ld+json">` blocks
- Validates JSON syntax
- Identifies schema types (Article, FAQPage, Product, HowTo, Organization, Person, Recipe, Event, Course, LocalBusiness, SoftwareApplication, WebPage, BreadcrumbList, etc.)
- Checks required/key fields per type (Article needs `headline`, Product needs `name`, FAQPage needs `mainEntity`)
- Validates `name`/`headline` in schema approximately matches the visible `<title>` tag (mismatch = Google flags as misleading)
- Checks `@context` is a valid schema.org reference

#### ✅ Open Graph / Twitter Card Completeness
When AI engines cite content, they use `og:title`, `og:description`, `og:image`, `og:type` for citation formatting. Missing OG tags = mangled citations even when content is found. Checks: og:title, og:description, og:image, og:type, og:url, twitter:card.

#### ✅ Sitemap Presence + URL Inclusion
Does `/sitemap.xml` or `/sitemap_index.xml` exist? Is the analyzed URL listed in it? Pages absent from a sitemap have significantly lower crawl probability for AI training bots.

#### ✅ Content Freshness Signals
Perplexity and real-time AI engines weight recency heavily. Checks (in reliability order):
1. JSON-LD `dateModified` — most authoritative
2. JSON-LD `datePublished`
3. HTTP `Last-Modified` response header
4. `<meta property="article:modified_time">` (Open Graph)
5. `<time datetime="...">` element

#### ✅ Expanded Bot Coverage: 7 AI Engines
Original checked 3. Now covers the full landscape:
1. **GPTBot** — OpenAI / ChatGPT
2. **ClaudeBot** — Anthropic / Claude
3. **PerplexityBot** — Perplexity AI
4. **Googlebot** — Google AI Overview
5. **Bingbot** — Microsoft Copilot
6. **Applebot** — Apple Intelligence
7. **Meta-ExternalAgent** — Meta AI

#### ✅ Crawl-Delay Detection in robots.txt
A `Crawl-delay: 3600` directive means a bot can only visit once per hour. The original parser silently ignored this. A site with `Crawl-delay: 86400` got a PASS. Now detected and flagged.

#### ✅ Redirect Chain Analysis
Counts redirect hops, classifies type (301 permanent vs 302 temporary), reports the full chain. 302 chains don't pass link signals. Bots may drop off after 2–3 hops.

---

### Revised Scoring Architecture

| Category | Weight | Checks Included |
|---|---|---|
| Fetchability | 12% | Fetch success, DNS, TLS, redirect chain |
| Bot Access | 18% | robots.txt + crawl-delay, 7-bot simulation |
| Crawl Signals | 20% | Meta robots, X-Robots-Tag, canonical, sitemap |
| Structured Data | 25% | JSON-LD presence, type recognition, field quality |
| JS Rendering | 12% | Raw vs. rendered content delta |
| Content Quality | 13% | Word count, extraction, OG completeness, freshness |

**Classification:**
- 80–100: Excellent — AI engines can find and understand your content
- 60–79: Good — minor gaps, unlikely to block AI visibility
- 40–59: Risky — at least one significant barrier to AI indexing
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
  -d '{"url":"https://example.com"}'
```

## Checks (v2 — 11 total)

| Check | Category |
|---|---|
| Fetchability | Fetchability |
| robots.txt + crawl-delay | Bot Access |
| Bot Simulation (7 bots) | Bot Access |
| Meta Robots + X-Robots-Tag | Crawl Signals |
| Canonical Tag | Crawl Signals |
| Sitemap | Crawl Signals |
| Structured Data (JSON-LD) | Structured Data |
| JS Rendering | Rendering |
| Content Extraction | Content Quality |
| Open Graph | Content Quality |
| Content Freshness | Content Quality |

## Notes

- The app serves the UI from `public/`.
- Runs with `tsx` (TypeScript via Node.js).
- Playwright is used for JS rendering comparison when available; falls back to heuristic detection.
- `vercel.json` installs only production dependencies during Vercel deploys.
