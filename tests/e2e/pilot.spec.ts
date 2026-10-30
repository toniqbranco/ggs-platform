import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "./fixtures";

for (const locale of ["es", "en"]) {
  for (const area of ["hq", "streamer"]) {
    test(`${locale}/${area} presents closed entry without accepting credentials`, async ({
      page,
    }) => {
      const mutations: string[] = [];
      page.on("request", (request) => {
        if (!["GET", "HEAD"].includes(request.method()))
          mutations.push(request.url());
      });
      await page.goto(`/${locale}/${area}`);
      await expect(page).toHaveTitle(
        locale === "es" ? /Solo por invitación/ : /Invitation only/,
      );
      await expect(page.locator("[data-pilot-entry]")).toHaveAttribute(
        "data-pilot-entry",
        area,
      );
      await expect(
        page.getByRole("button", {
          name:
            locale === "es"
              ? "Inicio de sesión próximamente"
              : "Sign-in coming soon",
        }),
      ).toBeDisabled();
      await expect(page.locator("#pilot-availability")).toContainText(
        locale === "es" ? "no crea cuentas" : "does not create accounts",
      );
      await expect(page.locator("form, input")).toHaveCount(0);
      expect(mutations).toEqual([]);
    });
  }
  for (const route of ["pilot", "access-denied"]) {
    test(`${locale}/${route} is localized, responsive, and accessible`, async ({
      page,
    }) => {
      await page.goto(`/${locale}/${route}`);
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
      await expect(page).toHaveTitle(
        `${await page.getByRole("heading", { level: 1 }).innerText()} · GG's`,
      );
      await expect(page.locator("[data-pilot-page]")).toHaveAttribute(
        "data-pilot-page",
        route === "pilot" ? "information" : "denied",
      );
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
      await expect(page.locator("form, input")).toHaveCount(0);
    });
  }
}

test("pilot policy and restricted-message navigation retain the current page when switching language", async ({
  page,
}) => {
  await page.goto("/en/hq");
  await page.getByRole("link", { name: "How access will work" }).click();
  await expect(page).toHaveURL(/\/en\/pilot$/);
  await page.getByRole("link", { name: "ES — Español", exact: true }).click();
  await expect(page).toHaveURL(/\/es\/pilot$/);
  await page.getByRole("link", { name: "¿No tienes invitación?" }).click();
  await expect(page).toHaveURL(/\/es\/access-denied$/);
  await page.getByRole("link", { name: "EN — English", exact: true }).click();
  await expect(page).toHaveURL(/\/en\/access-denied$/);
  await expect(page.locator(".space-nav [aria-current]")).toHaveCount(0);
  await page.getByRole("link", { name: "Back to home", exact: true }).click();
  await expect(page).toHaveURL(/\/en$/);
});

test("untrusted browser flags and a return URL cannot activate sign-in or redirect outside the site", async ({
  page,
  context,
}) => {
  await context.addCookies([
    { name: "pilot-role", value: "owner", domain: "127.0.0.1", path: "/" },
  ]);
  await page.addInitScript(() => {
    localStorage.setItem("pilot-role", "owner");
    localStorage.setItem("pilot-approved", "true");
  });
  await page.goto(
    "/en/hq?role=owner&invited=true&next=https%3A%2F%2Fexample.invalid",
  );
  await expect(page.locator("[data-pilot-entry]")).toHaveAttribute(
    "data-pilot-entry",
    "hq",
  );
  await expect(
    page.getByRole("button", { name: "Sign-in coming soon" }),
  ).toBeDisabled();
  await expect(page.locator("form, input")).toHaveCount(0);
  await page.getByRole("link", { name: "How access will work" }).click();
  await expect(page).toHaveURL(/\/en\/pilot$/);
});
