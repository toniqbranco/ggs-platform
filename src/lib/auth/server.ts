import "server-only";
import { createServerClient } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";
import { parsePilotAuthConfig, pilotAuthCookieName } from "./config";
import type { Database } from "@/lib/supabase/database.types";
import type { AuthGateway } from "./flow";
import {
  authOutcome,
  hasBrowserVerifier,
  recordAuthDiagnostic,
} from "./diagnostics";

export function getPilotAuthConfig() {
  return parsePilotAuthConfig(process.env);
}

function createPilotClient(
  request: NextRequest,
  response: NextResponse,
  statusOnly = false,
) {
  const config = getPilotAuthConfig();
  if (!config.enabled) throw new Error("Pilot sign-in is disabled.");
  // Each request owns its client and response. No auth data is shared/cached.
  return createServerClient<Database>(config.url, config.publishableKey, {
    cookieOptions: {
      name: pilotAuthCookieName,
      httpOnly: true,
      sameSite: "lax",
      secure: config.appOrigin.startsWith("https:"),
      path: "/",
    },
    global: {
      fetch: (url, options) => {
        if (statusOnly) {
          const target = new URL(
            url instanceof Request ? url.url : String(url),
          );
          const method = options?.method ?? "GET";
          const user =
            method === "GET" &&
            target.pathname === "/auth/v1/user" &&
            !target.search;
          const refresh =
            method === "POST" &&
            target.pathname === "/auth/v1/token" &&
            target.search === "?grant_type=refresh_token";
          if (
            target.origin !== config.url ||
            target.username ||
            target.password ||
            (!user && !refresh)
          )
            throw new Error("Pilot verification unavailable.");
        }
        return fetch(url, {
          ...options,
          cache: "no-store",
          signal: AbortSignal.timeout(10000),
          ...(statusOnly ? { redirect: "error" as const } : {}),
        });
      },
    },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(values, cacheHeaders) {
        for (const { name, value, options } of values)
          response.cookies.set(name, value, options);
        for (const [key, value] of Object.entries(cacheHeaders))
          response.headers.set(key, value);
      },
    },
  });
}

export function createPilotSetupVerifier(
  request: NextRequest,
  response: NextResponse,
) {
  const client = createPilotClient(request, response, true);
  return async () => {
    const result = await client.auth.getUser();
    if (result.error?.name === "AuthSessionMissingError")
      return { data: { user: null }, error: null };
    return result;
  };
}

export function createPilotGateway(
  request: NextRequest,
  response: NextResponse,
): AuthGateway {
  const config = getPilotAuthConfig();
  if (!config.enabled) throw new Error("Pilot sign-in is disabled.");
  const client = createPilotClient(request, response);
  return {
    requestLink: async (email, callback) => {
      const result = await client.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: false, emailRedirectTo: callback },
      });
      recordAuthDiagnostic(
        "request",
        hasBrowserVerifier(response.cookies.getAll()),
        authOutcome(result.error),
      );
      return result;
    },
    exchange: async (code) => {
      const browserVerifier = hasBrowserVerifier(request.cookies.getAll());
      const result = await client.auth.exchangeCodeForSession(code);
      recordAuthDiagnostic(
        "callback",
        browserVerifier,
        authOutcome(result.error),
      );
      return result;
    },
    verify: () => client.auth.getUser(),
    signOut: () => client.auth.signOut({ scope: "local" }),
  };
}
