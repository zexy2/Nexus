import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Transpile R3F / Three.js packages for proper ESM handling
  transpilePackages: [
    'three',
    '@react-three/fiber',
    '@react-three/drei',
    '@react-three/postprocessing',
  ],

  turbopack: {
    root: path.resolve(process.cwd(), "../.."),
  },

  // Image optimization
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "cdn.coverr.co",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "*.pexels.com",
        pathname: "/**",
      },
    ],
    formats: ["image/avif", "image/webp"],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048],
  },

  // Performance optimizations
  experimental: {
    optimizePackageImports: ["framer-motion", "lucide-react", "gsap"],
  },

  // Disable x-powered-by header
  poweredByHeader: false,

  // Baseline security headers applied to every response.
  async headers() {
    // Content-Security-Policy. The app needs inline scripts/styles (Next.js,
    // Tailwind, BlockNote), the configured image/video CDNs, and a WebSocket
    // connection to the collaboration server. Production enforces the policy;
    // development keeps report-only mode so local tooling remains usable.
    const isProduction = process.env.NODE_ENV === "production";
    const collabWs = process.env.NEXT_PUBLIC_COLLABORATION_URL || "ws://localhost:1234";
    const scriptSources = ["'self'", "'unsafe-inline'"];
    if (!isProduction) scriptSources.push("'unsafe-eval'");
    const csp = [
      "default-src 'self'",
      `script-src ${scriptSources.join(" ")}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://images.unsplash.com https://cdn.coverr.co https://*.pexels.com",
      "font-src 'self' data:",
      `connect-src 'self' ${collabWs}`,
      "media-src 'self' blob: https://cdn.coverr.co",
      "worker-src 'self' blob:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join("; ");
    const enforceCsp = process.env.CSP_ENFORCE
      ? process.env.CSP_ENFORCE === "true"
      : isProduction;
    const cspKey =
      enforceCsp
        ? "Content-Security-Policy"
        : "Content-Security-Policy-Report-Only";

    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          { key: "X-DNS-Prefetch-Control", value: "on" },
          { key: cspKey, value: csp },
        ],
      },
    ];
  },
};

export default nextConfig;
