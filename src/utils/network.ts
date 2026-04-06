import dns from "node:dns/promises";
import tls from "node:tls";

export async function dnsLookup(hostname: string): Promise<void> {
  await dns.lookup(hostname);
}

export function tlsHandshake(
  hostname: string,
): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    const socket = tls.connect(
      {
        host: hostname,
        port: 443,
        servername: hostname,
        rejectUnauthorized: true,
      },
      () => {
        socket.end();
        resolve({ ok: true });
      },
    );

    socket.setTimeout(5000, () => {
      socket.destroy();
      resolve({ ok: false, error: "TLS connection timed out" });
    });

    socket.on("error", (error) => {
      resolve({ ok: false, error: error.message });
    });
  });
}
