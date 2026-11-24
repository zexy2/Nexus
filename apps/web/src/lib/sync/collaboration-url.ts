export function getCollaborationUrl(): string {
  const configured = process.env.NEXT_PUBLIC_COLLABORATION_URL;

  if (typeof window === "undefined") {
    return configured || "ws://localhost:1234";
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const hostname = window.location.hostname;
  const isLocal = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";

  if (isLocal) {
    if (configured) {
      try {
        const configuredUrl = new URL(configured);
        if (configuredUrl.hostname === hostname) return configured;
      } catch {
        // Fall through to the local collaboration port for malformed values.
      }
    }
    return `${protocol}//${hostname}:1234`;
  }

  // The reverse proxy exposes collaboration at the same origin in production.
  // Ignore a stale host-specific build value so a domain migration cannot make
  // the editor connect to the previous deployment.
  if (!configured) return `${protocol}//${window.location.host}/collab`;

  try {
    const configuredUrl = new URL(configured);
    if (configuredUrl.hostname !== hostname) {
      return `${protocol}//${window.location.host}/collab`;
    }
  } catch {
    return `${protocol}//${window.location.host}/collab`;
  }

  return configured;
}
