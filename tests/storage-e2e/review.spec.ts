import AxeBuilder from "@axe-core/playwright";
import { test as base, expect, type BrowserContext } from "@playwright/test";

const test = base.extend({
  page: async ({ page, baseURL }, run) => {
    const external: string[] = [],
      errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (
        message.type() === "error" &&
        !/^Failed to load resource:.*403/.test(message.text())
      )
        errors.push(message.text());
    });
    await page.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (
        ["http:", "https:"].includes(url.protocol) &&
        url.origin !== new URL(baseURL!).origin
      ) {
        external.push(url.origin);
        return route.abort();
      }
      return route.continue();
    });
    await run(page);
    expect(external).toEqual([]);
    expect(errors).toEqual([]);
  },
});
async function identity(context: BrowserContext) {
  const sub = "00000000-0000-4000-8000-000000000001",
    exp = Math.floor(Date.now() / 1000) + 3600;
  const part = (data: object) =>
    Buffer.from(JSON.stringify(data)).toString("base64url");
  const token = `${part({ alg: "HS256", typ: "JWT" })}.${part({ sub, exp, iat: exp - 3600, aud: "authenticated" })}.fixture`;
  await context.addCookies([
    {
      name: "sb-rchxnmpsxfbsicthasxn-auth-token",
      value:
        "base64-" +
        part({
          access_token: token,
          refresh_token: "fixture-refresh",
          expires_at: exp,
          expires_in: 3600,
          token_type: "bearer",
          user: { id: sub },
        }),
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

const id = "00000000-0000-4000-8000-000000000010";
const application = {
  id,
  name: "GG Browser Fixture",
  email: "fixture@example.invalid",
  country: "Colombia",
  platform: "twitch",
  profile: "https://example.invalid/fixture",
  locale: "es",
  state: "approved",
  revision: 2,
  createdAt: "2026-01-01T00:00:00Z",
};
for (const locale of ["es", "en"] as const) {
  test(`${locale} read-only stored queue and history are accessible with no mutation controls`, async ({
    page,
    context,
  }) => {
    await identity(context);
    const writes: string[] = [];
    page.on("request", (request) => {
      if (request.method() !== "GET") writes.push(request.url());
    });
    await page.route("**/auth/application-review?**", (route) =>
      route.fulfill({
        json: route.request().url().includes("operation=list")
          ? {
              mode: "stored-readonly",
              applications: [application],
              bounded: true,
            }
          : {
              mode: "stored-readonly",
              events: [
                {
                  kind: "submitted",
                  revision: 1,
                  occurredAt: "2026-01-01T00:00:00Z",
                },
                {
                  kind: "approved",
                  revision: 2,
                  occurredAt: "2026-01-02T00:00:00Z",
                },
              ],
            },
      }),
    );
    await page.goto(`/${locale}/hq/applications`);
    const record = page.getByRole("button", { name: /GG Browser Fixture/ });
    await record.click();
    await expect(
      page.getByRole("heading", { name: "GG Browser Fixture", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: locale === "es" ? "Historial" : "History",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByText(locale === "es" ? "Enviada" : "Submitted", {
        exact: true,
      }),
    ).toBeVisible();
    await record.click();
    await expect(
      page.getByText(locale === "es" ? "Enviada" : "Submitted", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /^(Approve|Reject|Aprobar|Rechazar)/ }),
    ).toHaveCount(0);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true);
    expect(writes).toEqual([]);
    if (locale === "en")
      await page.screenshot({
        path: `test-results/stored-review-${test.info().project.name}.png`,
        fullPage: true,
      });
  });
  test(`${locale} denial while loading history removes the private profile and queue`, async ({
    page,
    context,
  }) => {
    await identity(context);
    await page.route("**/auth/application-review?**", (route) =>
      route.request().url().includes("operation=list")
        ? route.fulfill({
            json: {
              mode: "stored-readonly",
              applications: [application],
              bounded: true,
            },
          })
        : route.fulfill({ status: 403, json: { error: "denied" } }),
    );
    await page.goto(`/${locale}/hq/applications`);
    await page.getByRole("button", { name: /GG Browser Fixture/ }).click();
    await expect(page.getByRole("status")).toContainText(
      locale === "es" ? "no está disponible" : "unavailable",
    );
    await expect(
      page.getByText("fixture@example.invalid", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /GG Browser Fixture/ }),
    ).toHaveCount(0);
  });
}
test("anonymous real route never returns stored data and POST is unavailable", async ({
  request,
}) => {
  const response = await request.get("/auth/application-review?operation=list");
  expect(response.status()).toBe(401);
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect(await response.text()).not.toContain("Fixture");
  expect(
    (
      await request.post("/auth/application-review", {
        data: { operation: "decide" },
      })
    ).status(),
  ).toBe(405);
});
