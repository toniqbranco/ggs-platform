import type { NextConfig } from "next";
import { defaultLocale } from "./src/lib/i18n/config";
import { parseServerEnvironment } from "./src/lib/env/schema";

// Next.js loads the appropriate .env files before evaluating this configuration.
parseServerEnvironment(process.env);

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/", destination: `/${defaultLocale}`, permanent: false },
      { source: "/hq", destination: `/${defaultLocale}/hq`, permanent: false },
      {
        source: "/streamer",
        destination: `/${defaultLocale}/streamer`,
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
