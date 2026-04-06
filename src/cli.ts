import { runCrawlabilityCheck } from "./orchestrator.js";

function printUsage(): void {
  console.error("Usage: npm run start:cli -- <url> [--json]");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const jsonOnly = args.includes("--json");
  const url = args.find((arg) => !arg.startsWith("--"));

  if (!url) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  try {
    const report = await runCrawlabilityCheck(url);
    if (!jsonOnly) {
      console.log(report.summary);
      console.log("");
    }
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Failed to run crawlability check: ${message}`);
    process.exitCode = 1;
  }
}

await main();
