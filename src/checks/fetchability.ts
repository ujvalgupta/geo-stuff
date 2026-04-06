import type { CheckContext, CheckResult } from "../types.js";
import { fetchText } from "../utils/http.js";
import { dnsLookup, tlsHandshake } from "../utils/network.js";

const SLOW_RESPONSE_THRESHOLD_MS = 3000;

export async function runFetchabilityCheck(
  context: CheckContext,
): Promise<{ result: CheckResult; snapshot: Awaited<ReturnType<typeof fetchText>> }> {
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

  const snapshot = await fetchText(context.normalizedUrl.toString());

  const isHttpFailure =
    snapshot.fetchError ||
    (snapshot.statusCode !== null && snapshot.statusCode >= 400);
  const isSlow = snapshot.durationMs >= SLOW_RESPONSE_THRESHOLD_MS;

  const status = !dnsResolved || !tlsResult.ok || isHttpFailure
    ? "FAIL"
    : isSlow
      ? "WARNING"
      : "PASS";

  const reason = !dnsResolved
    ? `DNS lookup failed for ${hostname}`
    : !tlsResult.ok
      ? `TLS handshake failed for ${hostname}`
      : snapshot.fetchError
        ? `HTTP fetch failed: ${snapshot.fetchError}`
        : snapshot.statusCode !== null && snapshot.statusCode >= 400
          ? `Origin returned HTTP ${snapshot.statusCode}`
          : isSlow
            ? `DNS, TLS, and HTTP fetch succeeded, but the response was slow (${snapshot.durationMs} ms)`
            : "DNS, TLS, and HTTP fetch succeeded";

  return {
    result: {
      status,
      reason,
      metadata: {
        normalizedScore: status === "PASS" ? 1 : status === "WARNING" ? 0.5 : 0,
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
        slowThresholdMs: SLOW_RESPONSE_THRESHOLD_MS,
      },
    },
    snapshot,
  };
}
