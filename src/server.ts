import express from "express";
import type { Request, Response } from "express";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { runCrawlabilityCheck } from "./orchestrator.js";

const DEFAULT_PORT = 3000;
const DEFAULT_TIMEOUT_MS = 30000;

interface AnalyzeRequestBody {
  url?: unknown;
}

function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Analysis timed out after ${timeoutMs} ms`));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export function createServer(): express.Express {
  const app = express();
  const publicDir = path.resolve(process.cwd(), "public");

  app.use(express.static(publicDir));
  app.use(express.json({ limit: "1mb" }));

  app.get("/", (_req: Request, res: Response) => {
    res.sendFile(path.join(publicDir, "index.html"));
  });

  app.get("/health", (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  app.post(
    "/analyze",
    async (
      req: Request<Record<string, never>, unknown, AnalyzeRequestBody>,
      res: Response,
    ) => {
      const { url } = req.body ?? {};
      if (typeof url !== "string" || !isValidHttpUrl(url)) {
        res.status(400).json({
          error: "Invalid request body",
          message: "Expected JSON body with a valid http/https url string",
        });
        return;
      }

      const timeoutMs = Number(process.env.ANALYZE_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);

      try {
        const report = await withTimeout(runCrawlabilityCheck(url), timeoutMs);
        res.json({
          report,
          score: report.score,
          classification: report.classification,
          moduleBreakdown: report.breakdown,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const statusCode = message.includes("timed out") ? 504 : 500;

        res.status(statusCode).json({
          error: statusCode === 504 ? "AnalysisTimeout" : "AnalysisFailed",
          message,
        });
      }
    },
  );

  return app;
}

const app = createServer();

async function main(): Promise<void> {
  const port = Number(process.env.PORT ?? DEFAULT_PORT);

  await new Promise<void>((resolve) => {
    app.listen(port, () => {
      console.log(`AI Crawlability Checker API listening on port ${port}`);
      resolve();
    });
  });
}

export default app;

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
