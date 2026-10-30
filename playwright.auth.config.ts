import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

export default defineConfig({
  ...base,
  testDir: "./tests/auth-e2e",
  use: { ...base.use, baseURL: "http://127.0.0.1:3105" },
  projects: [
    {
      name: "auth-desktop",
      use: { browserName: "chromium", viewport: { width: 1440, height: 1000 } },
    },
    {
      name: "auth-mobile",
      use: {
        browserName: "chromium",
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    command: "pnpm start --hostname 127.0.0.1 --port 3105",
    url: "http://127.0.0.1:3105/es",
    reuseExistingServer: false,
    env: {
      APP_ENV: "test",
      NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3105",
      NEXT_PUBLIC_SUPABASE_ENABLED: "false",
      NEXT_PUBLIC_SUPABASE_URL: "",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
      PILOT_AUTH_ENABLED: "true",
      PILOT_SUPABASE_URL: "https://rchxnmpsxfbsicthasxn.supabase.co",
      PILOT_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture_only",
    },
  },
});
