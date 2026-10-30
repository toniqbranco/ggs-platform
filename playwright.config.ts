import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 2,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:3104",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "http", testMatch: "**/http.spec.ts" },
    {
      name: "desktop",
      testIgnore: "**/http.spec.ts",
      use: { browserName: "chromium", viewport: { width: 1440, height: 1000 } },
    },
    {
      name: "mobile",
      testIgnore: "**/http.spec.ts",
      use: {
        browserName: "chromium",
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    command: "pnpm start --hostname 127.0.0.1 --port 3104",
    url: "http://127.0.0.1:3104/es",
    reuseExistingServer: false,
    timeout: 60000,
    env: {
      APP_ENV: "test",
      PILOT_AUTH_ENABLED: "false",
      NODE_ENV: "production",
      NEXT_TELEMETRY_DISABLED: "1",
      NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3104",
      NEXT_PUBLIC_SUPABASE_ENABLED: "false",
      NEXT_PUBLIC_SUPABASE_URL: "",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
    },
  },
});
