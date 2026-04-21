import * as https from "node:https";
import * as dns from "node:dns/promises";
import * as net from "node:net";

// ─── Constants ─────────────────────────────────────────────────────────────

const DEFAULT_MAX_REDIRECTS = 5;
const MAX_RESPONSE_BYTES = 10 * 1024 * 1024; // 10 MB
const REQUEST_TIMEOUT_MS = 30_000;

// ─── Pure helpers (exported for testability) ───────────────────────────────

/**
 * Returns true when the given IP literal falls inside a range we refuse to
 * fetch from to prevent SSRF. Covers IPv4/IPv6 loopback, link-local (which
 * includes the cloud-metadata endpoint 169.254.169.254), RFC-1918 private
 * ranges, and IPv6 unique-local (fc00::/7). IPv4-mapped IPv6 addresses are
 * resolved and re-checked against their IPv4 form.
 */
export function isPrivateOrUnspecifiedIp(ip: string): boolean {
  if (ip === "::" || ip === "::1" || ip === "0.0.0.0") return true;
  // IPv4
  if (/^127\./.test(ip)) return true;                   // 127.0.0.0/8
  if (/^169\.254\./.test(ip)) return true;              // 169.254.0.0/16 (incl. metadata)
  if (/^10\./.test(ip)) return true;                    // 10.0.0.0/8
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return true; // 172.16.0.0/12
  if (/^192\.168\./.test(ip)) return true;              // 192.168.0.0/16
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(ip)) return true; // 100.64.0.0/10 CGNAT
  // IPv6
  if (/^fe[89ab]/i.test(ip)) return true;               // fe80::/10 link-local
  if (/^f[cd]/i.test(ip)) return true;                  // fc00::/7 unique-local
  // IPv4-mapped IPv6 (::ffff:10.0.0.1 etc.)
  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (mapped) return isPrivateOrUnspecifiedIp(mapped[1]);
  return false;
}

/**
 * Parses a URL and requires the https: scheme. Any other scheme (http:, ftp:,
 * file:, javascript:, data:, etc.) is rejected. Returned URL is already a
 * normalised absolute form.
 */
export function requireHttps(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }
  if (parsed.protocol !== "https:") {
    throw new Error(
      `Only https:// URLs are allowed (got ${parsed.protocol || "no scheme"}): ${url}`,
    );
  }
  return parsed;
}

/**
 * Resolves a redirect Location header against the request URL, producing an
 * absolute URL. Handles both relative (/foo) and absolute locations.
 */
export function resolveRedirect(baseUrl: string, location: string): string {
  return new URL(location, baseUrl).toString();
}

// ─── DNS resolution with allow-list semantics ──────────────────────────────

/**
 * If the host is an IP literal, validates it directly. Otherwise resolves via
 * dns.lookup({ all: true }) and requires that EVERY returned address is
 * public — any private address causes rejection, closing the door on
 * multi-homed hosts where only some addresses are private.
 *
 * Returns the address to pin the connection to (prevents DNS rebinding by
 * skipping a second resolution during the actual TCP connect).
 */
export async function resolveAndValidate(
  hostname: string,
  // Injection seam for tests
  lookup: typeof dns.lookup = dns.lookup,
): Promise<{ address: string; family: 4 | 6 }> {
  // URL.hostname returns bracketed IPv6 literals like "[::1]". Strip the
  // brackets before probing with net.isIP — otherwise we fall through to
  // the DNS path and the address never gets validated.
  const unbracketed =
    hostname.startsWith("[") && hostname.endsWith("]")
      ? hostname.slice(1, -1)
      : hostname;

  const literalFamily = net.isIP(unbracketed);
  if (literalFamily === 4 || literalFamily === 6) {
    if (isPrivateOrUnspecifiedIp(unbracketed)) {
      throw new Error(
        `Refusing to fetch private/loopback address: ${unbracketed}`,
      );
    }
    return { address: unbracketed, family: literalFamily as 4 | 6 };
  }

  const addrs = await lookup(hostname, { all: true });
  if (!Array.isArray(addrs) || addrs.length === 0) {
    throw new Error(`DNS returned no addresses for ${hostname}`);
  }
  for (const { address } of addrs) {
    if (isPrivateOrUnspecifiedIp(address)) {
      throw new Error(
        `Hostname ${hostname} resolves to private/loopback address ${address}`,
      );
    }
  }
  const first = addrs[0];
  return {
    address: first.address,
    family: (first.family as 4 | 6) ?? (net.isIPv6(first.address) ? 6 : 4),
  };
}

// ─── Main entrypoint ───────────────────────────────────────────────────────

/**
 * SSRF-hardened HTTP fetch for the skill-loader. Guarantees:
 *
 *   1. Only https:// URLs are followed (plain http is rejected).
 *   2. Target hostnames are pre-resolved and rejected if any returned address
 *      is loopback, link-local, RFC-1918/CGNAT, or IPv6 unique-local. The
 *      cloud-metadata endpoint (169.254.169.254) is covered.
 *   3. The TCP connection is pinned to the validated IP via a per-request
 *      `lookup` hook, so a DNS rebinding attacker cannot flip the address
 *      between validation and connection (TOCTOU).
 *   4. Redirects are resolved as absolute URLs against the request URL and
 *      re-validated from the top (scheme + DNS + IP range).
 *   5. Response bodies are capped at 10 MB.
 *   6. Requests time out after 30 s.
 *
 * The public contract matches the previous helper: string URL in, body
 * string out. Errors surface via promise rejection.
 */
export async function fetchUrl(
  url: string,
  redirectsLeft = DEFAULT_MAX_REDIRECTS,
): Promise<string> {
  if (redirectsLeft < 0) {
    throw new Error(`Too many redirects fetching: ${url}`);
  }

  const parsed = requireHttps(url);
  const { address, family } = await resolveAndValidate(parsed.hostname);

  return new Promise<string>((resolve, reject) => {
    const req = https.get(
      {
        hostname: parsed.hostname,
        port: parsed.port ? Number(parsed.port) : 443,
        path: parsed.pathname + parsed.search,
        // Pin DNS to the validated IP — prevents DNS rebinding attacks.
        // SNI / Host header still use parsed.hostname via `servername`.
        servername: parsed.hostname,
        lookup: (_hostname, _opts, cb) => {
          // Signature is compatible with https.get lookup hook.
          cb(null, address, family);
        },
        timeout: REQUEST_TIMEOUT_MS,
      },
      (response) => {
        const statusCode = response.statusCode ?? 0;

        // Redirect
        if (
          statusCode >= 300 &&
          statusCode < 400 &&
          response.headers.location
        ) {
          let next: string;
          try {
            next = resolveRedirect(url, response.headers.location);
          } catch {
            reject(
              new Error(
                `Invalid redirect Location header: ${response.headers.location}`,
              ),
            );
            response.resume();
            return;
          }
          response.resume();
          fetchUrl(next, redirectsLeft - 1).then(resolve, reject);
          return;
        }

        if (statusCode < 200 || statusCode >= 300) {
          reject(new Error(`HTTP ${statusCode} fetching: ${url}`));
          response.resume();
          return;
        }

        let size = 0;
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_RESPONSE_BYTES) {
            response.destroy();
            reject(
              new Error(
                `Response body exceeded ${MAX_RESPONSE_BYTES} bytes: ${url}`,
              ),
            );
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () =>
          resolve(Buffer.concat(chunks).toString("utf8")),
        );
        response.on("error", reject);
      },
    );

    req.on("timeout", () => {
      req.destroy(new Error(`Request timed out after ${REQUEST_TIMEOUT_MS}ms: ${url}`));
    });
    req.on("error", reject);
  });
}
