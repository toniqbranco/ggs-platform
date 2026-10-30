import { loadEnvConfig } from "@next/env";
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
  console.log("Environment valid. Supabase connections remain disabled.");
} catch (error) {
  console.error(
    error instanceof EnvironmentValidationError
      ? error.message
      : "Environment validation failed.",
  );
  process.exitCode = 1;
}
