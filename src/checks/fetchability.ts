import type { CheckContext, CheckResult } from "../types.js";
import { fetchText, fetchWithRedirectChain } from "../utils/http.js";
import { dnsLookup, tlsHandshake } from "../utils/network.js";

export async function runFetchabilityCheck(
  context: CheckContext,
): Promise<{ result: CheckResult; snapshot: Awaited<ReturnType<typeof fetchText>> & { redirectChain?: import("../types.js").RedirectHop[] } }> {
  const hostname = context.normalizedUrl.hostname;
  const protocol = context.normalizedUrl.protocol;

  let dnsResolved = false;
  let dnsError: string | undefined;
  try {
    await dnsLookup(hostname);
    dnsResolved = true;
  } catch (error) {
    dnsError = error instanceof Error ? error.message : String(error);
  }

  const tlsResult =
    protocol === "https:" ? await tlsHandshake(hostname) : { ok: true as const };

  // Run main fetch and redirect chain analysis in parallel
  const [snapshot, redirectResult] = await Promise.all([
    fetchText(context.normalizedUrl.toString()),
    fetchWithRedirectChain(context.normalizedUrl.toString()),
  ]);

  const redirectChain = redirectResult.chain;
  const redirectCount = Math.max(0, redirectChain.length - 1);
  const has302InChain = redirectChain.some((h) => h.statusCode === 302);

  const isHttpFailure =
    snapshot.fetchError ||
    (snapshot.statusCode !== null && snapshot.statusCode >= 400);

  let status: "PASS" | "WARNING" | "FAIL";
  let reason: string;

  if (!dnsResolved || !tlsResult.ok || isHttpFailure) {
    status = "FAIL";
    reason = !dnsResolved
      ? `DNS lookup failed for ${hostname}`
      : !tlsResult.ok
        ? `TLS handshake failed for ${hostname}`
        : snapshot.fetchError
          ? `HTTP fetch failed: ${snapshot.fetchError}`
          : `Origin returned HTTP ${snapshot.statusCode}`;
  } else if (redirectCount > 2) {
    status = "WARNING";
    reason = `${redirectCount} redirect hops before final URL — bots may drop off in long chains`;
  } else if (has302InChain) {
    status = "WARNING";
    reason = `302 temporary redirect in chain — link signals may not pass to final URL`;
  } else {
    status = "PASS";
    reason = redirectCount > 0
      ? `Fetched successfully via ${redirectCount} redirect${redirectCount > 1 ? "s" : ""}`
      : "DNS, TLS, and HTTP fetch succeeded";
  }

  return {
    result: {
      status,
      reason,
      metadata: {
        normalizedScore: status === "PASS" ? 1 : status === "WARNING" ? 0.7 : 0,
        hostname,
        dnsResolved,
        dnsError,
        tlsChecked: protocol === "https:",
        tlsOk: tlsResult.ok,
        tlsError: tlsResult.ok ? undefined : tlsResult.error,
        finalUrl: snapshot.finalUrl,
        statusCode: snapshot.statusCode,
        statusText: snapshot.statusText,
        durationMs: snapshot.durationMs,
        redirectCount,
        redirectChain,
        has302InChain,
      },
    },
    snapshot: { ...snapshot, redirectChain },
  };
}
