import { defineConfig } from "@playwright/test";
import auth from "./playwright.auth.config";

export default defineConfig({
  ...auth,
  testDir: "./tests/storage-e2e",
  use: { ...auth.use, baseURL: "http://127.0.0.1:3106" },
  webServer: {
    command:
      "node --import tsx --import ./tests/fixtures/review-auth-provider.ts node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3106",
    url: "http://127.0.0.1:3106/es",
    reuseExistingServer: false,
    env: {
      APP_ENV: "test",
      NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3106",
      NEXT_PUBLIC_SUPABASE_ENABLED: "false",
      NEXT_PUBLIC_SUPABASE_URL: "",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
      PILOT_AUTH_ENABLED: "true",
      PILOT_OWNER_USER_ID: "00000000-0000-4000-8000-000000000001",
      PILOT_SUPABASE_URL: "https://rchxnmpsxfbsicthasxn.supabase.co",
      PILOT_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture_only",
      PILOT_REVIEW_STORAGE_ENABLED: "true",
    },
  },
});
