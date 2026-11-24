const MAX_TRUSTED_PROXIES = 10;

/**
 * Number of reverse proxies in front of the app that append to
 * X-Forwarded-For (e.g. 2 for Cloudflare -> Caddy -> app). Configured with
 * TRUSTED_PROXY_COUNT; defaults to 1 (a single proxy), the original behaviour.
 */
export function getTrustedProxyCount(): number {
  const raw = process.env.TRUSTED_PROXY_COUNT;
  if (raw === undefined || raw.trim() === "") return 1;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 1 && value <= MAX_TRUSTED_PROXIES ? value : 1;
}

/**
 * Client IP as seen by the outermost trusted proxy.
 *
 * Each trusted proxy appends the address it received the connection from, so
 * with N trusted proxies the client is the N-th entry from the right; every
 * entry left of it is client-supplied and spoofable.
 */
export function getTrustedProxyClientIP(
  headers: Pick<Headers, "get">,
  trustedProxyCount = getTrustedProxyCount()
) {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const hops = forwarded
      .split(",")
      .map((hop) => hop.trim())
      .filter(Boolean);
    if (hops.length === 0) return "unknown";
    // Fewer hops than proxies: the request did not traverse the full chain;
    // the leftmost entry is the furthest address recorded.
    const index = Math.max(0, hops.length - trustedProxyCount);
    return hops[index] || "unknown";
  }

  return headers.get("x-real-ip")?.trim() || "127.0.0.1";
}
