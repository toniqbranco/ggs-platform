import assert from "node:assert/strict";
import { NextRequest, NextResponse } from "next/server";
import { createPilotGateway } from "../../src/lib/auth/server";
import { approvedPilotOrigin } from "../../src/lib/auth/config";
import { getPilotAuthConfig } from "../../src/lib/auth/server";
import { runAuth } from "../../src/lib/auth/flow";
import { approvedFixtureUser, fixtureOwnerId } from "./pilot-admissions";

Object.assign(process.env, {
  PILOT_AUTH_ENABLED: "true",
  PILOT_SUPABASE_URL: approvedPilotOrigin,
  PILOT_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture_only",
  APP_ENV: "test",
  NEXT_PUBLIC_APP_URL: "https://app.example.invalid",
  PILOT_OWNER_USER_ID: fixtureOwnerId,
});
const user = {
  id: "00000000-0000-4000-8000-000000000001",
  aud: "authenticated",
  role: "authenticated",
  email: "synthetic@example.invalid",
  email_confirmed_at: "2020-01-01T00:00:00Z",
  app_metadata: {},
  user_metadata: {},
  created_at: "2026-01-01T00:00:00Z",
};
function jwt(exp: number) {
  const part = (data: object) =>
    Buffer.from(JSON.stringify(data)).toString("base64url");
  return `${part({ alg: "HS256", typ: "JWT" })}.${part({ sub: user.id, exp, iat: Math.floor(Date.now() / 1000) - 60, aud: "authenticated", role: "authenticated" })}.fixture`;
}
const paths: string[] = [];
const previousFetch = globalThis.fetch;
let revoked = false;
let expireSession = false;
globalThis.fetch = async (input, options) => {
  const url = new URL(String(input));
  paths.push(url.pathname + url.search);
  assert.equal(url.origin, approvedPilotOrigin);
  assert.equal(options?.cache, "no-store");
  if (url.pathname.endsWith("/otp")) {
    const body = JSON.parse(String(options?.body));
    assert.equal(body.create_user, false);
    assert.ok(body.code_challenge);
    return Response.json({});
  }
  if (url.pathname.endsWith("/token")) {
    return Response.json({
      access_token: jwt(
        Math.floor(Date.now() / 1000) + (expireSession ? 1 : 3600),
      ),
      token_type: "bearer",
      refresh_token: "synthetic-refresh",
      expires_in: expireSession ? 1 : 3600,
      user,
    });
  }
  if (url.pathname.endsWith("/user"))
    return revoked
      ? Response.json(
          { code: "session_not_found", message: "revoked" },
          { status: 401 },
        )
      : Response.json(user);
  if (url.pathname.endsWith("/logout")) {
    assert.equal(url.searchParams.get("scope"), "local");
    return new Response(null, { status: 204 });
  }
  throw new Error("Unexpected auth call");
};
function requestFrom(response: NextResponse) {
  const request = new NextRequest("https://app.example.invalid/auth/session");
  for (const cookie of response.cookies.getAll())
    request.cookies.set(cookie.name, cookie.value);
  return request;
}
async function main() {
  try {
    const missingBrowser = await runAuth(
      "callback",
      new NextRequest(
        "https://app.example.invalid/auth/callback?code=synthetic-code&locale=en",
      ),
      { config: getPilotAuthConfig, gateway: createPilotGateway },
    );
    assert.equal(
      missingBrowser.headers.get("location"),
      "https://app.example.invalid/en/sign-in?state=browser-required",
    );
    assert.equal(
      paths.length,
      0,
      "A missing verifier must fail before contacting Auth",
    );
    const linkResponse = NextResponse.json({});
    const first = createPilotGateway(
      new NextRequest("https://app.example.invalid/auth/sign-in"),
      linkResponse,
    );
    assert.equal(
      (
        await first.requestLink(
          "synthetic@example.invalid",
          "https://app.example.invalid/auth/callback?locale=en",
        )
      ).error,
      null,
    );
    const verifier = linkResponse.cookies
      .getAll()
      .find((x) => x.name.endsWith("code-verifier"));
    assert.ok(verifier);
    assert.ok(verifier.httpOnly);
    assert.ok(verifier.secure);
    assert.equal(verifier.sameSite, "lax");
    const exchangeResponse = NextResponse.json({});
    const second = createPilotGateway(
      requestFrom(linkResponse),
      exchangeResponse,
    );
    assert.equal((await second.exchange("synthetic-code")).error, null);
    assert.equal((await second.verify()).data.user?.id, user.id);
    assert.match(
      exchangeResponse.headers.get("cache-control")!,
      /private.*no-store/,
    );
    assert.equal(exchangeResponse.headers.get("pragma"), "no-cache");
    const sessionRequest = requestFrom(exchangeResponse);
    const logoutResponse = NextResponse.json({});
    assert.equal(
      (await createPilotGateway(sessionRequest, logoutResponse).signOut())
        .error,
      null,
    );
    assert.ok(logoutResponse.cookies.getAll().some((x) => x.maxAge === 0));
    revoked = true;
    const denied = await createPilotGateway(
      sessionRequest,
      NextResponse.json({}),
    ).verify();
    assert.ok(denied.error);
    assert.equal(denied.data.user, null);
    revoked = false;
    expireSession = true;
    const expiring = NextResponse.json({});
    await createPilotGateway(requestFrom(linkResponse), expiring).exchange(
      "synthetic-code",
    );
    expireSession = false;
    const refreshed = NextResponse.json({});
    assert.equal(
      (await createPilotGateway(requestFrom(expiring), refreshed).verify()).data
        .user?.id,
      user.id,
    );
    assert.ok(paths.some((x) => x.includes("grant_type=refresh_token")));
    assert.ok(refreshed.cookies.getAll().some((x) => x.value.length > 0));
    assert.match(refreshed.headers.get("cache-control")!, /no-store/);
    // Simulate authoritative Auth records changing while the browser keeps the
    // same original JWT/cookies. getUser must supply the latest approval.
    const approved = approvedFixtureUser("owner");
    user.app_metadata = approved.app_metadata;
    const accessRequest = requestFrom(exchangeResponse);
    const accessUrl = new URL(accessRequest.url);
    accessUrl.searchParams.set("area", "hq");
    const hqRequest = new NextRequest(accessUrl, {
      headers: accessRequest.headers,
    });
    const deps = { config: getPilotAuthConfig, gateway: createPilotGateway };
    assert.equal((await runAuth("access", hqRequest, deps)).status, 200);
    user.app_metadata = {
      ggs_pilot: {
        ...approved.app_metadata.ggs_pilot,
        membership: "suspended",
      },
    };
    assert.equal((await runAuth("access", hqRequest, deps)).status, 403);
    user.app_metadata = {};
    assert.equal(
      (await runAuth("session", accessRequest, deps)).cookies
        .getAll()
        .some((cookie) => cookie.maxAge === 0),
      true,
    );
    console.log("auth-cookie-refresh-revocation-pass");
  } finally {
    globalThis.fetch = previousFetch;
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
