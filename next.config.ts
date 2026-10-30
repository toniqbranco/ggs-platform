import type { NextConfig } from "next";
import { defaultLocale } from "./src/lib/i18n/config";
import { parseServerEnvironment } from "./src/lib/env/schema";
import { securityHeaders } from "./src/lib/security/headers";

// Next.js loads the appropriate .env files before evaluating this configuration.
parseServerEnvironment(process.env);

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders(process.env.NODE_ENV === "production"),
      },
    ];
  },
  async redirects() {
    return [
      { source: "/", destination: `/${defaultLocale}`, permanent: false },
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
