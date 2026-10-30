import { test, expect } from "@playwright/test";
import { pages } from "./fixtures";

for (const entry of pages) {
  test(`${entry.path} serves a localized page with security headers`, async ({
    request,
  }) => {
    const response = await request.get(entry.path);
    expect(response.status()).toBe(200);
    expect(await response.text()).toContain(`<html lang="${entry.locale}"`);
    const headers = response.headers();
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["permissions-policy"]).toContain("microphone=()");
    expect(headers["x-robots-tag"]).toContain("noindex");
    expect(headers["x-powered-by"]).toBeUndefined();
    expect(headers["content-security-policy"]).toContain("connect-src 'self'");
    expect(headers["content-security-policy"]).toContain(
      "frame-ancestors 'none'",
    );
    expect(headers["content-security-policy"]).not.toContain("unsafe-eval");
  });
}

for (const [source, destination] of [
  ["/", "/es"],
  ["/hq", "/es/hq"],
  ["/streamer", "/es/streamer"],
]) {
  test(`${source} defaults to Spanish and preserves query parameters`, async ({
    request,
    baseURL,
  }) => {
    const response = await request.get(`${source}?source=foundation`, {
      maxRedirects: 0,
      headers: { "accept-language": "en" },
    });
    expect(response.status()).toBe(307);
    const url = new URL(response.headers().location!, baseURL);
    expect(url.pathname).toBe(destination);
    expect(url.searchParams.get("source")).toBe("foundation");
  });
}

for (const path of ["/fr", "/fr/hq", "/es/unknown", "/en/unknown"]) {
  test(`${path} returns 404`, async ({ request }) => {
    expect((await request.get(path)).status()).toBe(404);
  });
}

test("self-hosted artwork and font license are served", async ({ request }) => {
  const image = await request.get("/images/creator-editorial.webp");
  expect(image.status()).toBe(200);
  expect(image.headers()["content-type"]).toContain("image/webp");
  expect((await image.body()).byteLength).toBeLessThan(150000);
  const license = await request.get("/fonts/roboto-OFL.txt");
  expect(license.status()).toBe(200);
  expect(await license.text()).toContain("SIL OPEN FONT LICENSE");
});
