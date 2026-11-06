import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
for (const locale of ["es", "en"]) {
  test(`${locale} fictional setup completes, survives refresh and switches language without granting access`, async ({
    page,
  }) => {
    const external: string[] = [];
    const mutations: string[] = [];
    page.on("request", (r) => {
      if (new URL(r.url()).hostname !== "localhost") external.push(r.url());
      if (r.url().includes("/auth/setup-local/") && r.method() === "POST")
        mutations.push(r.postData() ?? "");
    });
    const es = locale === "es";
    const response = await page.goto(`/${locale}/setup/local`);
    expect(response?.headers()["cache-control"]).toContain("no-store");
    expect(response?.headers()["referrer-policy"]).toBe("no-referrer");
    await page
      .getByRole("button", {
        name: es ? "Empezar prueba" : "Begin test",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("heading", {
        name: es ? "Una base segura" : "A secure foundation",
      }),
    ).toBeVisible();
    await expect(
      page.getByLabel(es ? "Contraseña de prueba" : "Test password", {
        exact: true,
      }),
    ).toHaveAttribute("readonly", "");
    await page
      .getByRole("button", {
        name: es ? "Establecer contraseña de prueba" : "Set test password",
      })
      .click();
    await expect(
      page.getByRole("heading", {
        name: es
          ? "Un perfil con tu identidad"
          : "A profile with your identity",
      }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByText("GG Demo Creator", { exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: `test-results/local-setup-${locale}-${test.info().project.name}.png`,
      fullPage: true,
    });
    await page
      .getByRole("button", {
        name: es ? "Guardar perfil de ejemplo" : "Save sample profile",
      })
      .click();
    await expect(
      page.getByRole("heading", {
        name: es
          ? "Todo listo para el siguiente paso"
          : "Ready for the next step",
      }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: es ? "Completar prueba" : "Complete test" })
      .click();
    await expect(
      page.getByRole("heading", {
        name: es
          ? "Estás listo para lo que viene"
          : "Ready for what comes next",
      }),
    ).toBeVisible();
    await page
      .getByRole("link", {
        name: es ? "Switch to English" : "Cambiar a español",
      })
      .click();
    await expect(
      page.getByRole("heading", {
        name: es
          ? "Ready for what comes next"
          : "Estás listo para lo que viene",
      }),
    ).toBeVisible();
    expect(external).toEqual([]);
    expect(mutations.length).toBeGreaterThan(4);
    expect(mutations.every((body) => body === "{}")).toBe(true);
    expect(
      await page.locator('a[href*="hq"],a[href*="streamer"]').count(),
    ).toBe(0);
    const cookies = await page.context().cookies();
    expect(
      cookies.some(
        (c) =>
          c.name === "ggs-local-setup-fictional" &&
          c.httpOnly &&
          c.sameSite === "Strict",
      ),
    ).toBe(true);
    expect(
      cookies.some(
        (c) => c.name.startsWith("sb-ggs-onboarding-fixture-") && c.httpOnly,
      ),
    ).toBe(true);
    expect(cookies.some((c) => c.name.includes("rchxnmpsxfbsicthasxn"))).toBe(
      false,
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
  });
}
test("a failed request shows recovery controls and never automatically repeats a password action", async ({
  page,
}) => {
  await page.goto("/en/setup/local");
  await page.getByRole("button", { name: "Begin test", exact: true }).click();
  let writes = 0;
  await page.route("**/auth/setup-local/password", (route) => {
    writes++;
    return route.fulfill({
      status: 409,
      json: { error: "reconciliation-required" },
    });
  });
  await page.getByRole("button", { name: "Set test password" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Check its status" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Check previous result" }),
  ).toBeVisible();
  expect(writes).toBe(1);
  await page.getByRole("button", { name: "Check status", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Set test password" }),
  ).toBeVisible();
  expect(writes).toBe(1);
});
test("a new browser starts with no test identity and real sign-in remains off", async ({
  page,
  request,
}) => {
  await page.goto("/en/setup/local");
  await expect(
    page.getByRole("button", { name: "Begin test", exact: true }),
  ).toBeVisible();
  expect((await request.get("/auth/access?area=hq")).status()).toBe(503);
  expect((await request.get("/en/hq")).status()).toBe(404);
});
