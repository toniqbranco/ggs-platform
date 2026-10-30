import { loadEnvConfig } from "@next/env";
import { parsePilotAuthConfig } from "../src/lib/auth/config";
import {
  EnvironmentValidationError,
  parseServerEnvironment,
} from "../src/lib/env/schema";

const production =
  process.argv.includes("--production") ||
  process.env.NODE_ENV === "production";
loadEnvConfig(process.cwd(), !production);

try {
  parseServerEnvironment(process.env);
  const auth = parsePilotAuthConfig(process.env);
  console.log(
    auth.enabled
      ? "Environment valid. Pilot sign-in targets the approved testing project; browser services remain disabled."
      : "Environment valid. Supabase connections remain disabled.",
  );
} catch (error) {
  console.error(
    error instanceof EnvironmentValidationError
      ? error.message
      : "Environment validation failed.",
  );
  process.exitCode = 1;
}
