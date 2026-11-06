import { spawn } from "node:child_process";
if (
  process.env.NODE_ENV === "production" ||
  process.env.APP_ENV === "production"
)
  throw new Error("Local setup fixture cannot run in production");
const child = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "dev",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3107",
  ],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      NODE_ENV: "development",
      APP_ENV: "test",
      GGS_SETUP_LOCAL_FIXTURE: "fictional-only",
      NEXT_PUBLIC_APP_URL: "http://localhost:3107",
      PILOT_AUTH_ENABLED: "false",
      PILOT_REVIEW_STORAGE_ENABLED: "false",
      NEXT_PUBLIC_SUPABASE_ENABLED: "false",
      NEXT_PUBLIC_SUPABASE_URL: "",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
);
child.on("error", () => {
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
