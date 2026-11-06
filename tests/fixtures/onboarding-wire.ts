import { NextRequest, type NextResponse } from "next/server";
import { fixtureSetupOrigin } from "../../proposals/streamer-onboarding/fixture-gateway";
import { runSetupHttpFixture } from "../../proposals/streamer-onboarding/http-fixture";
export { setupWireFixture } from "../../proposals/streamer-onboarding/wire-fixture";
export function setupRequest(
  action: string,
  body: unknown,
  cookies: NextResponse["cookies"] | undefined = undefined,
  headers: Record<string, string> = {},
) {
  const request = new NextRequest(
    `${fixtureSetupOrigin}/auth/setup/${action}`,
    {
      method: "POST",
      headers: {
        origin: fixtureSetupOrigin,
        "sec-fetch-site": "same-origin",
        "content-type": "application/json",
        ...headers,
      },
      body: JSON.stringify(body),
    },
  );
  for (const cookie of cookies?.getAll() ?? [])
    if (cookie.value && cookie.maxAge !== 0)
      request.cookies.set(cookie.name, cookie.value);
  return request;
}
export function setupHttpClient(
  deps: Parameters<typeof runSetupHttpFixture>[1],
) {
  const jar = new Map<string, string>();
  return {
    jar,
    async send(
      action: string,
      body: unknown,
      headers: Record<string, string> = {},
    ) {
      const request = setupRequest(action, body, undefined, headers);
      for (const [name, value] of jar) request.cookies.set(name, value);
      const response = await runSetupHttpFixture(request, deps);
      for (const cookie of response.cookies.getAll()) {
        if (cookie.maxAge === 0 || !cookie.value) jar.delete(cookie.name);
        else jar.set(cookie.name, cookie.value);
      }
      return response;
    },
  };
}
