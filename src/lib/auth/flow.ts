import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import type { PilotAuthConfig } from "./config";
import { isLocale, type Locale } from "@/lib/i18n/config";

type Result = { error: unknown | null };
export type AuthGateway = {
  requestLink(email: string, callback: string): Promise<Result>;
  exchange(code: string): Promise<Result>;
  verify(): Promise<{
    data: { user: { id: string } | null };
    error: unknown | null;
  }>;
  signOut(): Promise<Result>;
};
type Dependencies = {
  config(): PilotAuthConfig;
  gateway(request: NextRequest, response: NextResponse): AuthGateway;
};
export type AuthOperation = "sign-in" | "callback" | "session" | "sign-out";

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
      if ((await gateway.exchange(code)).error)
        return redirect(`/${locale}/sign-in?state=expired`);
      const verified = await gateway.verify();
      if (verified.error || !verified.data.user)
        return redirect(`/${locale}/sign-in?state=expired`);
    } catch {
      return redirect(`/${locale}/sign-in?state=expired`);
    }
    return response;
  }
  const response = privateResponse(
    NextResponse.json({ authenticated: false, workspaceAccess: false }),
  );
  try {
    const { data, error } = await deps.gateway(request, response).verify();
    if (!error && data.user) {
      // Identity is verified, but admission/role enforcement is the next increment.
      const verified = privateResponse(
        NextResponse.json({ authenticated: true, workspaceAccess: false }),
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
