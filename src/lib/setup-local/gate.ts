export const localSetupOrigin = "http://localhost:3107";
export function localSetupEnabled(env: Record<string, string | undefined>) {
  return (
    env.NODE_ENV === "development" &&
    env.APP_ENV === "test" &&
    env.GGS_SETUP_LOCAL_FIXTURE === "fictional-only" &&
    env.NEXT_PUBLIC_APP_URL === localSetupOrigin &&
    env.PILOT_AUTH_ENABLED === "false" &&
    env.PILOT_REVIEW_STORAGE_ENABLED === "false" &&
    env.NEXT_PUBLIC_SUPABASE_ENABLED === "false" &&
    env.NEXT_PUBLIC_SUPABASE_URL === "" &&
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY === ""
  );
}
export function localSetupHost(headers: Pick<Headers, "get">) {
  return (
    headers.get("host") === "localhost:3107" &&
    (!headers.get("x-forwarded-host") ||
      headers.get("x-forwarded-host") === "localhost:3107")
  );
}
