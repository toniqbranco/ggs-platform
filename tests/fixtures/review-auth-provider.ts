// Preloaded only by the Auth browser-test server. Never imported by application code.
import { approvedFixtureUser } from "./pilot-admissions";

if (
  process.env.APP_ENV !== "test" ||
  process.env.PILOT_SUPABASE_PUBLISHABLE_KEY !== "sb_publishable_fixture_only"
)
  throw new Error("Fixture provider requires isolated test configuration");
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.origin !== "https://rchxnmpsxfbsicthasxn.supabase.co")
    return originalFetch(input, init);
  if (url.pathname !== "/auth/v1/user")
    throw new Error(
      "Browser tests must never send email, create accounts, or mutate Auth",
    );
  const header = new Headers(init?.headers).get("authorization") ?? "";
  const token = header.replace(/^Bearer /, "");
  if (!token.endsWith(".fixture"))
    return Response.json(
      { message: "Invalid fixture", code: "bad_jwt" },
      { status: 401 },
    );
  const payload = JSON.parse(
    Buffer.from(token.split(".")[1]!, "base64url").toString(),
  );
  const role =
    payload.sub === "00000000-0000-4000-8000-000000000001"
      ? "owner"
      : payload.sub === "00000000-0000-4000-8000-000000000003"
        ? "admin"
        : "streamer";
  return Response.json({
    ...approvedFixtureUser(role),
    aud: "authenticated",
    role: "authenticated",
    email: "browser-fixture@example.invalid",
    user_metadata: {},
    created_at: "2020-01-01T00:00:00Z",
  });
};
