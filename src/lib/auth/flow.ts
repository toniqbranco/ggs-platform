import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import type { PilotAuthConfig } from "./config";
import { pilotAuthCookieName } from "./config";
import { isLocale, type Locale } from "@/lib/i18n/config";
import {
  hasPilotAdmission,
  readPilotAdmission,
  type VerifiedPilotUser,
} from "@/lib/pilot/admission";
import { evaluatePilotPolicy, pilotTargets } from "@/lib/pilot/policy";

type Result = { error: unknown | null };
export type AuthGateway = {
  requestLink(email: string, callback: string): Promise<Result>;
  exchange(code: string): Promise<Result>;
  verify(): Promise<{
    data: { user: VerifiedPilotUser | null };
    error: unknown | null;
  }>;
  signOut(): Promise<Result>;
};
type Dependencies = {
  config(): PilotAuthConfig;
  gateway(request: NextRequest, response: NextResponse): AuthGateway;
};
export type AuthOperation =
  "sign-in" | "callback" | "session" | "sign-out" | "access";

async function closeDeniedSession(
  request: NextRequest,
  response: NextResponse,
  gateway: AuthGateway,
  secure: boolean,
) {
  // Revoke the current provider session when possible, and always remove its
  // browser cookies. Never return a newly exchanged token after admission denial.
  try {
    await gateway.signOut();
  } catch {
    /* Denial still holds during provider failure. */
  }
  const names = new Set(
    [...request.cookies.getAll(), ...response.cookies.getAll()].map(
      (cookie) => cookie.name,
    ),
  );
  for (const name of names) {
    if (
      name === pilotAuthCookieName ||
      name.startsWith(pilotAuthCookieName + ".") ||
      name === pilotAuthCookieName + "-code-verifier"
    )
      response.cookies.set(name, "", {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        secure,
        maxAge: 0,
      });
  }
}

export function privateResponse(response: NextResponse) {
  response.headers.set(
    "Cache-Control",
    "private, no-cache, no-store, must-revalidate, max-age=0",
  );
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

export async function runAuth(
  operation: AuthOperation,
  request: NextRequest,
  deps: Dependencies,
) {
  const config = deps.config();
  if (!config.enabled)
    return privateResponse(
      NextResponse.json({ error: "unavailable" }, { status: 503 }),
    );
  const url = new URL(request.url);
  // Origin comes from reviewed configuration, never Host/X-Forwarded-Host/next.
  let locale: Locale = isLocale(url.searchParams.get("locale") ?? "")
    ? (url.searchParams.get("locale") as Locale)
    : "es";
  const redirect = (path: string) =>
    privateResponse(
      NextResponse.redirect(new URL(path, config.appOrigin), 303),
    );
  const accessTarget = url.searchParams.get("area");
  if (
    operation === "access" &&
    !pilotTargets.some((target) => target === accessTarget)
  )
    return privateResponse(
      NextResponse.json({ allowed: false }, { status: 400 }),
    );
  if (operation === "sign-in" || operation === "sign-out") {
    if (request.headers.get("origin") !== config.appOrigin)
      return privateResponse(
        NextResponse.json({ error: "origin" }, { status: 403 }),
      );
    if (
      !request.headers
        .get("content-type")
        ?.startsWith("application/x-www-form-urlencoded")
    )
      return privateResponse(
        NextResponse.json({ error: "form" }, { status: 415 }),
      );
    if (Number(request.headers.get("content-length")) > 4096)
      return privateResponse(
        NextResponse.json({ error: "size" }, { status: 413 }),
      );
    // Limit streamed bodies as well as declared Content-Length.
    const reader = request.body?.getReader();
    let text = "";
    let size = 0;
    const decoder = new TextDecoder();
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 4096) {
          await reader.cancel();
          return privateResponse(
            NextResponse.json({ error: "size" }, { status: 413 }),
          );
        }
        text += decoder.decode(value, { stream: true });
      }
      text += decoder.decode();
    }
    const fields = new URLSearchParams(text);
    if (isLocale(fields.get("locale") ?? ""))
      locale = fields.get("locale") as Locale;
    if (operation === "sign-out") {
      const response = redirect(`/${locale}/sign-in?state=signed-out`);
      try {
        if ((await deps.gateway(request, response).signOut()).error)
          return redirect(`/${locale}/sign-in?state=unavailable`);
      } catch {
        return redirect(`/${locale}/sign-in?state=unavailable`);
      }
      return response;
    }
    const email = z.email().max(254).safeParse(fields.get("email")?.trim());
    if (!email.success) return redirect(`/${locale}/sign-in?state=invalid`);
    const response = redirect(`/${locale}/sign-in?state=sent`);
    // With no explicitly selected owner, admission cannot be established. Do not
    // send real links while owner bootstrap is still awaiting review.
    if (!config.ownerUserId) return response;
    try {
      // Identical response for known/unknown/uninvited addresses and provider errors.
      await deps
        .gateway(request, response)
        .requestLink(
          email.data,
          `${config.appOrigin}/auth/callback?locale=${locale}`,
        );
    } catch {
      /* Avoid revealing account existence or provider details. */
    }
    return response;
  }
  if (operation === "callback") {
    const code = url.searchParams.get("code");
    if (
      !code ||
      !/^[A-Za-z0-9_-]{8,2048}$/.test(code) ||
      url.searchParams.has("error")
    )
      return redirect(`/${locale}/sign-in?state=expired`);
    const response = redirect(`/${locale}/session`);
    try {
      const gateway = deps.gateway(request, response);
      const exchanged = await gateway.exchange(code);
      if (exchanged.error) {
        // A missing browser verifier is not an expired email link. Keep PKCE
        // required and give a precise recovery instruction without exposing
        // tokens, cookie contents, or provider error messages.
        const error = exchanged.error;
        const wrongBrowser =
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "pkce_code_verifier_not_found";
        return redirect(
          `/${locale}/sign-in?state=${wrongBrowser ? "browser-required" : "expired"}`,
        );
      }
      const verified = await gateway.verify();
      if (verified.error || !verified.data.user)
        return redirect(`/${locale}/sign-in?state=expired`);
      const admission = readPilotAdmission(
        verified.data.user,
        config.ownerUserId,
      );
      if (!hasPilotAdmission(admission)) {
        await closeDeniedSession(
          request,
          response,
          gateway,
          config.appOrigin.startsWith("https:"),
        );
        response.headers.set(
          "Location",
          new URL(
            `/${locale}/sign-in?state=approval-required`,
            config.appOrigin,
          ).href,
        );
        return response;
      }
    } catch {
      return redirect(`/${locale}/sign-in?state=expired`);
    }
    return response;
  }
  const response = privateResponse(
    operation === "access"
      ? NextResponse.json({ allowed: false }, { status: 401 })
      : NextResponse.json({ authenticated: false, workspaceAccess: false }),
  );
  try {
    const gateway = deps.gateway(request, response);
    const { data, error } = await gateway.verify();
    if (!error && data.user) {
      // Fetch the current server-managed approval on every request. Never authorize
      // with cookie/JWT metadata, browser roles, or a cached approval snapshot.
      const admission = readPilotAdmission(data.user, config.ownerUserId);
      if (!hasPilotAdmission(admission)) {
        await closeDeniedSession(
          request,
          response,
          gateway,
          config.appOrigin.startsWith("https:"),
        );
        const denied = privateResponse(
          operation === "access"
            ? NextResponse.json({ allowed: false }, { status: 403 })
            : NextResponse.json({
                authenticated: false,
                workspaceAccess: false,
                accessDenied: true,
              }),
        );
        for (const cookie of response.cookies.getAll())
          denied.cookies.set(cookie);
        return denied;
      }
      const decision =
        operation === "access"
          ? evaluatePilotPolicy(accessTarget, admission)
          : null;
      const verified = privateResponse(
        decision
          ? NextResponse.json(
              { allowed: decision.allowed },
              { status: decision.allowed ? 200 : 403 },
            )
          : NextResponse.json({
              authenticated: true,
              approved: true,
              workspaceAccess: false,
            }),
      );
      for (const cookie of response.cookies.getAll())
        verified.cookies.set(cookie);
      return verified;
    }
  } catch {
    return privateResponse(
      NextResponse.json({ error: "unavailable" }, { status: 503 }),
    );
  }
  return response;
}
