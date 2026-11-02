import { pilotAuthCookieName } from "./config";

export function hasBrowserVerifier(
  cookies: { name: string; value: string; maxAge?: number | undefined }[],
) {
  return cookies.some(
    (cookie) =>
      cookie.value.length > 0 &&
      cookie.maxAge !== 0 &&
      (cookie.name === `${pilotAuthCookieName}-code-verifier` ||
        (cookie.name.startsWith(`${pilotAuthCookieName}-flow-`) &&
          /-flow-[A-Za-z0-9_-]{8,64}-code-verifier(?:\.\d+)?$/.test(
            cookie.name,
          ))),
  );
}
export function authOutcome(
  error: unknown,
): "accepted" | "rate-limited" | "missing-verifier" | "unavailable" {
  if (!error) return "accepted";
  const code = typeof error === "object" && "code" in error ? error.code : null;
  if (
    code === "over_email_send_rate_limit" ||
    code === "over_request_rate_limit"
  )
    return "rate-limited";
  if (code === "pkce_code_verifier_not_found") return "missing-verifier";
  return "unavailable";
}
export function recordAuthDiagnostic(
  stage: "request" | "callback",
  browserVerifier: boolean,
  outcome: ReturnType<typeof authOutcome>,
) {
  if (
    process.env.APP_ENV === "development" &&
    process.env.NODE_ENV !== "production"
  )
    console.info("[pilot-auth]", { stage, browserVerifier, outcome });
}
