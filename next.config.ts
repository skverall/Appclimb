import type { NextConfig } from "next";

const developmentEval =
  process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : "";
const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  `script-src 'self' 'unsafe-inline'${developmentEval} https://cdn.paddle.com https://*.paddle.com https://public.profitwell.com`,
  "style-src 'self' 'unsafe-inline' https://cdn.paddle.com",
  "font-src 'self' data:",
  "img-src 'self' data: blob: https://*.paddle.com https://is*-ssl.mzstatic.com",
  "connect-src 'self' https://*.paddle.com https://itunes.apple.com",
  "frame-src https://*.paddle.com",
  "upgrade-insecure-requests",
].join("; ");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  async redirects() {
    return [
      {
        // Keep OAuth cookies and CIMD client_id on a single host.
        source: "/:path*",
        has: [{ type: "host", value: "www.appclimb.app" }],
        destination: "https://appclimb.app/:path*",
        permanent: true,
      },
      {
        source: "/blog/what-is-app-store-conversion-rate.html",
        destination: "/blog/app-store-conversion-rate",
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin",
          },
          {
            key: "Content-Security-Policy",
            value: contentSecurityPolicy,
          },
        ],
      },
    ];
  },
};

export default nextConfig;
