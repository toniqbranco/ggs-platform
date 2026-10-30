import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "../e2e/fixtures";
for (const locale of ["es", "en"]) {
  test(`${locale} approval denial is clear and accessible`, async ({
    page,
  }) => {
    await page.goto(`/${locale}/sign-in?state=approval-required`);
    await expect(page.getByRole("status")).toContainText(
      locale === "es" ? "requiere aprobación" : "requires approval",
    );
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.route("**/auth/session", (route) =>
      route.fulfill({
        json: {
          authenticated: false,
          workspaceAccess: false,
          accessDenied: true,
        },
      }),
    );
    await page.goto(`/${locale}/session`);
    await expect(page.getByRole("status")).toContainText(
      locale === "es" ? "no tiene acceso aprobado" : "does not have approved",
    );
    await expect(
      page.getByRole("button", {
        name: locale === "es" ? "Cerrar sesión" : "Sign out",
      }),
    ).toHaveCount(0);
  });
  test(`${locale} sign-in is accessible, localized, and excludes HQ`, async ({
    page,
  }) => {
    await page.goto(`/${locale}/sign-in`);
    await expect(page.getByRole("textbox")).toHaveAttribute("type", "email");
    await expect(page.getByRole("textbox")).toHaveAccessibleName(
      locale === "es" ? "Correo electrónico" : "Email address",
    );
    await expect(page.locator('a[href*="/hq"]')).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.setViewportSize({ width: 320, height: 740 });
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true);
    await page
      .getByRole("link", {
        name: locale === "es" ? "EN — English" : "ES — Español",
        exact: true,
      })
      .click();
    await expect(page).toHaveURL(
      new RegExp("/" + (locale === "es" ? "en" : "es") + "/sign-in$"),
    );
  });
}
test("session check cannot grant workspace access to browser role claims", async ({
  page,
  context,
}) => {
  await context.addCookies([
    { name: "pilot-role", value: "owner", domain: "127.0.0.1", path: "/" },
  ]);
  await page.goto("/en/session?role=owner");
  await expect(page.getByRole("status")).toContainText(
    "There is no valid session",
  );
  await expect(page.getByRole("button", { name: "Sign out" })).toHaveCount(0);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
});
test("invalid sign-in and callback fail locally; no email or account is created", async ({
  request,
  baseURL,
}) => {
  const response = await request.post("/auth/sign-in", {
    headers: { origin: baseURL! },
    form: { locale: "en", email: "invalid" },
    maxRedirects: 0,
  });
  expect(response.status()).toBe(303);
  expect(response.headers().location).toBe(
    baseURL + "/en/sign-in?state=invalid",
  );
  const callback = await request.get(
    "/auth/callback?locale=en&next=https://attacker.invalid",
    { maxRedirects: 0 },
  );
  expect(callback.headers().location).toBe(
    baseURL + "/en/sign-in?state=expired",
  );
  expect(callback.headers()["cache-control"]).toContain("no-store");
  expect((await request.get("/en/hq")).status()).toBe(404);
  for (const area of ["hq", "streamer", "pilot-management"]) {
    const denied = await request.get(
      `/auth/access?area=${area}&role=owner&approved=true`,
      { headers: { cookie: "pilot-role=owner;pilot-approved=true" } },
    );
    expect(denied.status()).toBe(401);
    expect(await denied.json()).toEqual({ allowed: false });
    expect(denied.headers()["cache-control"]).toContain("no-store");
  }
  expect((await request.get("/auth/access?area=constructor")).status()).toBe(
    400,
  );
});
