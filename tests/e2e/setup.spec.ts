import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "./fixtures";

for (const locale of ["es", "en"]) {
  test(`${locale} setup preview cannot collect credentials or activate membership`, async ({
    page,
  }) => {
    const writes: string[] = [];
    const provider: string[] = [];
    page.on("request", (request) => {
      if (request.method() !== "GET") writes.push(request.url());
      if (request.url().includes("supabase.co")) provider.push(request.url());
    });
    const response = await page.goto(
      `/${locale}/setup?role=owner&passwordSet=true&next=https://example.invalid`,
    );
    expect(response?.headers()["cache-control"]).toContain("no-store");
    expect(response?.headers()["referrer-policy"]).toBe("no-referrer");
    await expect(
      page.getByText(
        locale === "es"
          ? "Vista previa · Datos ficticios"
          : "Preview · Fictional details",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(page.locator('input[type="password"]')).toHaveCount(2);
    for (const input of await page.locator('input[type="password"]').all()) {
      await expect(input).toBeDisabled();
      await expect(input).toHaveValue("");
    }
    await expect(page.locator("form")).toHaveCount(0);
    await expect(page.locator('a[href*="/hq"]')).toHaveCount(0);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page
      .getByRole("link", {
        name: locale === "es" ? "Ver paso del perfil" : "Preview profile step",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("heading", {
        name:
          locale === "es" ? "Tu perfil de streamer" : "Your streamer profile",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByText("creator@example.invalid", { exact: true }),
    ).toBeVisible();
    await expect(page.locator("input, select, textarea")).toHaveCount(0);
    await expect(
      page.getByRole("button", {
        name:
          locale === "es"
            ? "Guardar perfil · Aún no disponible"
            : "Save profile · Not available yet",
      }),
    ).toBeDisabled();
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
      new RegExp(`/${locale === "es" ? "en" : "es"}/setup\\?step=profile$`),
    );
    expect(writes).toEqual([]);
    expect(provider).toEqual([]);
  });
}
