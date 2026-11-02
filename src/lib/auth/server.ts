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

export function createPilotGateway(
  request: NextRequest,
  response: NextResponse,
): AuthGateway {
  const config = getPilotAuthConfig();
  if (!config.enabled) throw new Error("Pilot sign-in is disabled.");
  // Each request owns its client and response. No auth data is shared/cached.
  const client = createServerClient<Database>(
    config.url,
    config.publishableKey,
    {
      cookieOptions: {
        name: pilotAuthCookieName,
        httpOnly: true,
        sameSite: "lax",
        secure: config.appOrigin.startsWith("https:"),
        path: "/",
      },
      global: {
        fetch: (url, options) =>
          fetch(url, {
            ...options,
            cache: "no-store",
            signal: AbortSignal.timeout(10000),
          }),
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
    },
  );
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
