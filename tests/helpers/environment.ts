export const environmentKeys = [
  "PILOT_AUTH_ENABLED",
  "PILOT_APPLICATIONS_ENABLED",
  "GGS_PG17_TEST_ACK",
  "GGS_PG17_TEST_PORT",
  "GGS_PG17_TEST_PASSWORD",
  "PILOT_OWNER_USER_ID",
  "PILOT_SUPABASE_URL",
  "PILOT_SUPABASE_PUBLISHABLE_KEY",
  "APP_ENV",
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_SUPABASE_ENABLED",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_SUPABASE_SECRET_KEY",
  "NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
] as const;

export function cleanEnvironment(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NEXT_TELEMETRY_DISABLED: "1",
  };
  for (const key of environmentKeys) delete env[key];
  return env;
}

// Reserved .invalid host and deliberately artificial key: never real credentials.
export const supabaseFixture = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.invalid",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
    "sb_publishable_wp01_fixture_not_a_real_key",
};
