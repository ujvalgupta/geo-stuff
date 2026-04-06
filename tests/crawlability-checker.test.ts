import { afterEach, beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals";

type RouteResponse = {
  status: number;
  headers?: Record<string, string>;
  body?: string;
  delayMs?: number;
};

type FetchScenario = {
  page: RouteResponse;
  robots?: RouteResponse;
  botOverrides?: Record<string, RouteResponse>;
};

const dnsLookupMock = jest.fn<() => Promise<void>>();
const tlsHandshakeMock = jest.fn<
  (hostname: string) => Promise<{ ok: boolean; error?: string }>
>();

jest.unstable_mockModule("../src/utils/network.ts", () => ({
  dnsLookup: dnsLookupMock,
  tlsHandshake: tlsHandshakeMock,
}));

const compareRawAndRenderedPageMock = jest.fn();

jest.unstable_mockModule("../src/utils/rendering.ts", () => ({
  compareRawAndRenderedPage: compareRawAndRenderedPageMock,
}));

let runCrawlabilityCheck: typeof import("../src/orchestrator.ts").runCrawlabilityCheck;
let nowMs = 0;

const DEFAULT_HTML = `
<!doctype html>
<html>
  <head>
    <title>Accessible page</title>
    <meta name="description" content="A crawlable test page" />
  </head>
  <body>
    <main>
      <h1>Accessible content</h1>
      <p>${"This page contains meaningful server-rendered text. ".repeat(20)}</p>
    </main>
  </body>
</html>
`;

const JS_RENDERED_HTML = `
<!doctype html>
<html>
  <head>
    <title>JS App</title>
    <script>window.__INITIAL_STATE__ = {};</script>
    <script src="/static/a.js"></script>
    <script src="/static/b.js"></script>
    <script src="/static/c.js"></script>
    <script src="/static/d.js"></script>
    <script src="/static/e.js"></script>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
`;

const scenarios: Record<string, FetchScenario> = {
  "https://accessible.example/": {
    page: {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
      body: DEFAULT_HTML,
    },
    robots: {
      status: 200,
      headers: { "content-type": "text/plain" },
      body: "User-agent: *\nAllow: /\n",
    },
  },
  "https://robots-blocked.example/": {
    page: {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
      body: DEFAULT_HTML,
    },
    robots: {
      status: 200,
      headers: { "content-type": "text/plain" },
      body: "User-agent: GPTBot\nDisallow: /\nUser-agent: Googlebot\nDisallow: /\nUser-agent: PerplexityBot\nDisallow: /\n",
    },
  },
  "https://js-rendered.example/": {
    page: {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
      body: JS_RENDERED_HTML,
    },
    robots: {
      status: 200,
      headers: { "content-type": "text/plain" },
      body: "User-agent: *\nAllow: /\n",
    },
  },
  "https://error-403.example/": {
    page: {
      status: 403,
      headers: { "content-type": "text/html; charset=utf-8" },
      body: "<html><body><h1>Forbidden</h1><p>Access denied</p></body></html>",
    },
    robots: {
      status: 200,
      headers: { "content-type": "text/plain" },
      body: "User-agent: *\nAllow: /\n",
    },
    botOverrides: {
      GPTBot: {
        status: 403,
        headers: { "content-type": "text/html; charset=utf-8" },
        body: "<html><body>Access denied</body></html>",
      },
      Googlebot: {
        status: 403,
        headers: { "content-type": "text/html; charset=utf-8" },
        body: "<html><body>Access denied</body></html>",
      },
      PerplexityBot: {
        status: 403,
        headers: { "content-type": "text/html; charset=utf-8" },
        body: "<html><body>Access denied</body></html>",
      },
    },
  },
  "https://error-404.example/": {
    page: {
      status: 404,
      headers: { "content-type": "text/html; charset=utf-8" },
      body: "<html><body><h1>Not Found</h1></body></html>",
    },
    robots: {
      status: 200,
      headers: { "content-type": "text/plain" },
      body: "User-agent: *\nAllow: /\n",
    },
  },
  "https://slow.example/": {
    page: {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
      body: DEFAULT_HTML,
      delayMs: 5000,
    },
    robots: {
      status: 200,
      headers: { "content-type": "text/plain" },
      body: "User-agent: *\nAllow: /\n",
    },
  },
  "https://bot-variant.example/": {
    page: {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
      body: DEFAULT_HTML,
    },
    robots: {
      status: 200,
      headers: { "content-type": "text/plain" },
      body: "User-agent: *\nAllow: /\n",
    },
    botOverrides: {
      GPTBot: {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
        body: "<html><body><h1>Limited bot view</h1><p>Short preview only.</p></body></html>",
      },
    },
  },
};

function getScenarioResponse(url: string, init?: RequestInit): RouteResponse {
  const normalized = new URL(url).toString();
  const scenario = scenarios[normalized] ?? scenarios[normalized.replace("/robots.txt", "/")];
  if (!scenario) {
    throw new Error(`No scenario registered for ${url}`);
  }

  if (normalized.endsWith("/robots.txt")) {
    return scenario.robots ?? {
      status: 404,
      headers: { "content-type": "text/plain" },
      body: "",
    };
  }

  const userAgent = new Headers(init?.headers).get("user-agent") ?? "";
  const matchedBot = Object.keys(scenario.botOverrides ?? {}).find((bot) =>
    userAgent.includes(bot)
  );

  if (matchedBot) {
    return scenario.botOverrides?.[matchedBot] ?? scenario.page;
  }

  return scenario.page;
}

function installFetchMock(): void {
  global.fetch = jest.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const response = getScenarioResponse(url, init);
    nowMs += response.delayMs ?? 0;

    return new Response(response.body ?? "", {
      status: response.status,
      headers: response.headers,
    });
  }) as typeof fetch;
}

beforeAll(async () => {
  ({ runCrawlabilityCheck } = await import("../src/orchestrator.ts"));
});

beforeEach(() => {
  nowMs = 0;
  jest.spyOn(Date, "now").mockImplementation(() => nowMs);
  dnsLookupMock.mockResolvedValue(undefined);
  tlsHandshakeMock.mockResolvedValue({ ok: true });
  compareRawAndRenderedPageMock.mockImplementation(async (_url: string, rawHtml: string) => ({
    rawTextLength: rawHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().length,
    renderedTextLength: rawHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().length,
    rawDomNodeCount: rawHtml.match(/<([a-zA-Z][^\s/>]*)\b[^>]*>/g)?.length ?? 0,
    renderedDomNodeCount: rawHtml.match(/<([a-zA-Z][^\s/>]*)\b[^>]*>/g)?.length ?? 0,
    renderDependencyScore: 0.05,
    heavilyJsDependent: false,
    available: true,
  }));
  installFetchMock();
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

describe("AI Crawlability Checker scenarios", () => {
  it("classifies a fully accessible URL as PASS with passing modules", async () => {
    const report = await runCrawlabilityCheck("https://accessible.example/");

    expect(report.checks.fetchability.status).toBe("PASS");
    expect(report.checks.robotsTxt.status).toBe("PASS");
    expect(report.checks.botAccessSimulation.status).toBe("PASS");
    expect(report.checks.javascriptRendering.status).toBe("PASS");
    expect(report.checks.htmlParsability.status).toBe("PASS");
    expect(report.checks.contentExtraction.status).toBe("PASS");
    expect(report.checks.contentExtraction.metadata.extractionSource).toBe("main");
    expect((report.checks.contentExtraction.metadata.llmReadiness as number) >= 0.75).toBe(true);
    expect((report.checks.contentExtraction.metadata.textDensity as number) >= 20).toBe(true);
    expect(report.score).toBe(97);
    expect(report.overallStatus).toBe("PASS");
    expect(report.classification).toBe("Excellent");
  });

  it("classifies robots.txt blocking as FAIL and identifies the blocked bots", async () => {
    const report = await runCrawlabilityCheck("https://robots-blocked.example/");

    expect(report.checks.fetchability.status).toBe("PASS");
    expect(report.checks.robotsTxt.status).toBe("FAIL");
    expect(report.checks.robotsTxt.reason).toContain("GPTBot");
    expect(report.checks.botAccessSimulation.status).toBe("PASS");
    expect(report.score).toBe(84);
    expect(report.overallStatus).toBe("PASS");
    expect(report.classification).toBe("Excellent");
  });

  it("flags JS-rendered pages with rendering and extraction problems", async () => {
    compareRawAndRenderedPageMock.mockResolvedValue({
      rawTextLength: 6,
      renderedTextLength: 420,
      rawDomNodeCount: 10,
      renderedDomNodeCount: 80,
      renderDependencyScore: 0.86,
      heavilyJsDependent: true,
      available: true,
    });

    const report = await runCrawlabilityCheck("https://js-rendered.example/");

    expect(report.checks.fetchability.status).toBe("PASS");
    expect(report.checks.robotsTxt.status).toBe("PASS");
    expect(report.checks.javascriptRendering.status).toBe("WARNING");
    expect(report.checks.javascriptRendering.metadata.renderDependencyScore).toBe(0.86);
    expect(report.checks.javascriptRendering.metadata.heavilyJsDependent).toBe(true);
    expect(report.checks.htmlParsability.status).toBe("PASS");
    expect(report.checks.contentExtraction.status).toBe("FAIL");
    expect((report.checks.contentExtraction.metadata.llmReadiness as number) < 0.45).toBe(true);
    expect(report.score).toBe(73);
    expect(report.overallStatus).toBe("PASS");
    expect(report.classification).toBe("Good");
  });

  it("treats 403 pages as inaccessible and failing overall", async () => {
    const report = await runCrawlabilityCheck("https://error-403.example/");

    expect(report.checks.fetchability.status).toBe("FAIL");
    expect(report.checks.fetchability.reason).toContain("403");
    expect(report.checks.botAccessSimulation.status).toBe("FAIL");
    expect(report.checks.htmlParsability.status).toBe("PASS");
    expect(report.checks.contentExtraction.status).toBe("FAIL");
    expect(report.score).toBe(55);
    expect(report.overallStatus).toBe("WARNING");
    expect(report.classification).toBe("Risky");
  });

  it("treats 404 pages as failing fetchability and overall classification", async () => {
    const report = await runCrawlabilityCheck("https://error-404.example/");

    expect(report.checks.fetchability.status).toBe("FAIL");
    expect(report.checks.fetchability.reason).toContain("404");
    expect(report.checks.robotsTxt.status).toBe("PASS");
    expect(report.checks.botAccessSimulation.status).toBe("FAIL");
    expect(report.checks.contentExtraction.status).toBe("FAIL");
    expect(report.score).toBe(55);
    expect(report.overallStatus).toBe("WARNING");
    expect(report.classification).toBe("Risky");
  });

  it("downgrades slow responses to WARNING while keeping accessible content otherwise healthy", async () => {
    const report = await runCrawlabilityCheck("https://slow.example/");

    expect(report.checks.fetchability.status).toBe("WARNING");
    expect(report.checks.fetchability.reason).toContain("slow");
    expect(report.checks.robotsTxt.status).toBe("PASS");
    expect(report.checks.botAccessSimulation.status).toBe("PASS");
    expect(report.checks.contentExtraction.status).toBe("PASS");
    expect(report.score).toBe(87);
    expect(report.overallStatus).toBe("PASS");
    expect(report.classification).toBe("Excellent");
  });

  it("flags bot responses that differ materially from the browser baseline", async () => {
    const report = await runCrawlabilityCheck("https://bot-variant.example/");

    expect(report.checks.fetchability.status).toBe("PASS");
    expect(report.checks.botAccessSimulation.status).toBe("WARNING");
    expect(report.checks.botAccessSimulation.reason).toContain("differ");

    const simulations = report.checks.botAccessSimulation.metadata.simulations as Array<{
      userAgent: string;
      comparisonToBrowser?: {
        differentStatusCode: boolean;
        responseLengthDeltaPercent: number;
        htmlDifferent: boolean;
      };
    }>;

    const gptBot = simulations.find((item) => item.userAgent.includes("GPTBot"));
    expect(gptBot?.comparisonToBrowser?.differentStatusCode).toBe(false);
    expect(gptBot?.comparisonToBrowser?.htmlDifferent).toBe(true);
    expect((gptBot?.comparisonToBrowser?.responseLengthDeltaPercent ?? 0) > 20).toBe(true);
    expect(report.overallStatus).toBe("PASS");
    expect(report.classification).toBe("Excellent");
  });
});
