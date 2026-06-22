export function getTrustedProxyClientIP(headers: Pick<Headers, "get">) {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const hops = forwarded.split(",");
    return hops.at(-1)?.trim() || "unknown";
  }

  return headers.get("x-real-ip")?.trim() || "127.0.0.1";
}
