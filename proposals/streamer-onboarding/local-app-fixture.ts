import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  localSetupEnabled,
  localSetupHost,
  localSetupOrigin,
} from "../../src/lib/setup-local/gate";
import { setupWireFixture } from "./wire-fixture";
import { boundedJson, runSetupHttpFixture } from "./http-fixture";
import { FixtureGatewayError } from "./fixture-gateway";
import type { LocalSetupView } from "../../src/lib/setup-local/contract";
const cookieName = "ggs-local-setup-fictional";
const age = 30 * 60 * 1000;
function createSession() {
  const wire = setupWireFixture();
  const invitationId = randomUUID();
  const session = {
    wire,
    busy: false,
    created: Date.now(),
    invitation: wire.seed("invitation", invitationId, 2),
    password: wire.seed("password", invitationId, 3),
    profile: {
      invitationId,
      operationId: randomUUID(),
      expectedBindingRevision: 4,
    },
    finalize: {
      invitationId,
      operationId: randomUUID(),
      expectedBindingRevision: 5,
    },
  };
  for (const operation of wire.records.values())
    operation.expiresAt = new Date(session.created + age).toISOString();
  return session;
}
type Session = ReturnType<typeof createSession>;
const sessions = new Map<string, Session>();
function response(body: object, status = 200) {
  const reply = NextResponse.json(body, { status });
  reply.headers.set("Cache-Control", "private, no-store, max-age=0");
  reply.headers.set("Pragma", "no-cache");
  reply.headers.set("Referrer-Policy", "no-referrer");
  reply.headers.set("Vary", "Cookie");
  return reply;
}
function copyCookies(from: NextResponse, to: NextResponse) {
  for (const cookie of from.cookies.getAll()) to.cookies.set(cookie);
}
function relay(
  request: NextRequest,
  session: Session,
  action: string,
  payload: object,
  prior?: NextResponse,
) {
  const next = new NextRequest(`${localSetupOrigin}/auth/setup/${action}`, {
    method: "POST",
    headers: {
      origin: localSetupOrigin,
      "sec-fetch-site": "same-origin",
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  for (const cookie of request.cookies.getAll())
    next.cookies.set(cookie.name, cookie.value);
  for (const cookie of prior?.cookies.getAll() ?? []) {
    if (cookie.maxAge === 0) next.cookies.delete(cookie.name);
    else next.cookies.set(cookie.name, cookie.value);
  }
  return runSetupHttpFixture(next, session.wire.deps);
}
/** Separate ephemeral fictional-data app. Never a hosted persistence/permission service. */
export async function runLocalSetup(request: NextRequest) {
  if (!localSetupEnabled(process.env) || !localSetupHost(request.headers))
    return response({ error: "not-found" }, 404);
  const url = new URL(request.url);
  if (
    url.origin !== localSetupOrigin ||
    url.search ||
    request.headers.get("origin") !== localSetupOrigin ||
    request.headers.get("sec-fetch-site") !== "same-origin"
  )
    return response({ error: "denied" }, 403);
  if (request.method !== "POST")
    return response({ error: "method-not-allowed" }, 405);
  const action = url.pathname.slice("/auth/setup-local/".length);
  if (
    !url.pathname.startsWith("/auth/setup-local/") ||
    ![
      "start",
      "status",
      "password",
      "password-receipt",
      "profile",
      "finalize",
    ].includes(action)
  )
    return response({ error: "not-found" }, 404);
  if (
    request.headers.get("content-type")?.split(";")[0]?.trim() !==
    "application/json"
  )
    return response({ error: "invalid" }, 415);
  let locked: Session | undefined;
  let reservation: string | undefined;
  try {
    if (
      !z
        .object({})
        .strict()
        .safeParse(await boundedJson(request)).success
    )
      return response({ error: "invalid" }, 400);
    for (const [id, session] of sessions)
      if (session.created + age <= Date.now()) sessions.delete(id);
    let id = request.cookies.get(cookieName)?.value;
    let session = id ? sessions.get(id) : undefined;
    let effect: NextResponse | undefined;
    if (action === "start") {
      if (sessions.size >= 128) return response({ error: "unavailable" }, 503);
      const oldId = id;
      id = randomBytes(32).toString("hex");
      session = createSession();
      sessions.set(id, session);
      reservation = id;
      effect = await relay(request, session, "invitation", {
        ...session.invitation,
        tokenHash: "a".repeat(64),
      });
      if (!effect.ok) {
        sessions.delete(id);
        return effect;
      }
      if (oldId) sessions.delete(oldId);
      sessions.set(id, session);
      reservation = undefined;
    } else if (!session || !id)
      return response({ error: "session-ended" }, 410);
    if (!session || !id) return response({ error: "unavailable" }, 503);
    if (action !== "status" && action !== "start") {
      if (session.busy) return response({ error: "conflict" }, 409);
      session.busy = true;
      locked = session;
    }
    const revision = session.wire.state.bindingRevision;
    if (
      (action === "password" && revision !== 3) ||
      (action === "profile" && revision !== 4) ||
      (action === "finalize" && revision !== 5)
    )
      return response({ error: "conflict" }, 409);
    if (
      action !== "start" &&
      action !== "status" &&
      !(action === "password-receipt" && revision >= 4)
    ) {
      const payload =
        action === "password"
          ? {
              ...session.password,
              newPassword: "Fictional-Setup-Password-Only",
              confirmPassword: "Fictional-Setup-Password-Only",
            }
          : action === "password-receipt"
            ? session.password
            : action === "profile"
              ? {
                  ...session.profile,
                  expectedProfileRevision: 0,
                  displayName: "Stream Talents Demo Creator",
                  country: "Colombia",
                  platform: "twitch",
                  profileUrl: "https://example.invalid/creator",
                  locale: "es",
                }
              : session.finalize;
      effect = await relay(request, session, action, payload);
      if (!effect.ok) return effect;
    }
    const status = await relay(
      request,
      session,
      "status",
      { invitationId: session.invitation.invitationId },
      effect,
    );
    if (!status.ok) {
      if (effect) copyCookies(effect, status);
      return status;
    }
    const data = await status.json();
    const view: LocalSetupView = {
      stage:
        data.membership === "active"
          ? "complete"
          : data.bindingRevision === 5
            ? "review"
            : data.bindingRevision === 4
              ? "profile"
              : "password",
    };
    const result = response(view);
    if (effect) copyCookies(effect, result);
    copyCookies(status, result);
    result.cookies.set(cookieName, id, {
      httpOnly: true,
      sameSite: "strict",
      secure: false,
      path: "/auth/setup-local",
      maxAge: Math.max(
        1,
        Math.floor((session.created + age - Date.now()) / 1000),
      ),
    });
    return result;
  } catch (error) {
    if (reservation) sessions.delete(reservation);
    return error instanceof FixtureGatewayError && error.reason === "invalid"
      ? response({ error: "invalid" }, 400)
      : response({ error: "unavailable" }, 503);
  } finally {
    if (locked) locked.busy = false;
  }
}
