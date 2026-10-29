import type { NextConfig } from "next";
import { defaultLocale } from "./src/lib/i18n/config";

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
