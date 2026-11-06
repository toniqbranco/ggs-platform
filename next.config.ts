import type { NextConfig } from "next";
import { defaultLocale } from "./src/lib/i18n/config";
import { parseServerEnvironment } from "./src/lib/env/schema";
import { securityHeaders } from "./src/lib/security/headers";
import { parsePilotAuthConfig } from "./src/lib/auth/config";
import { localSetupEnabled } from "./src/lib/setup-local/gate";

// Next.js loads the appropriate .env files before evaluating this configuration.
parseServerEnvironment(process.env);
parsePilotAuthConfig(process.env);

const nextConfig: NextConfig = {
  ...(localSetupEnabled(process.env) ? { devIndicators: false as const } : {}),
  distDir: localSetupEnabled(process.env) ? ".next-setup-fixture" : ".next",
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:locale/hq/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-store" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
      {
        source: "/:locale/:authPage(sign-in|session|setup)",
        headers: [{ key: "Cache-Control", value: "private, no-store" }],
      },
      {
        source: "/:path*",
        headers: securityHeaders(process.env.NODE_ENV === "production"),
      },
      {
        source: "/:locale/setup/local",
        headers: [
          { key: "Cache-Control", value: "private, no-store" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
      {
        source: "/:locale/setup",
        headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
      },
    ];
  },
  async redirects() {
    return [
      { source: "/", destination: `/${defaultLocale}`, permanent: false },
      {
        source: "/setup/local",
        destination: `/${defaultLocale}/setup/local`,
        permanent: false,
      },
      {
        source: "/setup",
        destination: `/${defaultLocale}/setup`,
        permanent: false,
      },
      {
        source: "/pilot",
        destination: `/${defaultLocale}/pilot`,
        permanent: false,
      },
      {
        source: "/access-denied",
        destination: `/${defaultLocale}/access-denied`,
        permanent: false,
      },
      {
        source: "/streamer",
        destination: `/${defaultLocale}/streamer`,
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
