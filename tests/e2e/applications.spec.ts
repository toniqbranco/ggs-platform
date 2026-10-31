import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "./fixtures";

for (const locale of ["es", "en"]) {
  test(`${locale} application rehearsal validates without submission or persistence`, async ({
    page,
  }) => {
    const submissions: string[] = [];
    page.on("request", (request) => {
      if (request.method() !== "GET") submissions.push(request.url());
    });
    await page.goto(`/${locale}/apply`);
    await expect(page.locator('a[href*="/hq"]')).toHaveCount(0);
    const email = page.getByLabel(
      locale === "es" ? "Correo electrónico" : "Email address",
      { exact: true },
    );
    await email.fill("invalid");
    await page
      .getByRole("button", {
        name: locale === "es" ? "Comprobar vista previa" : "Check preview",
      })
      .click();
    await expect(email).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByRole("status")).toContainText(
      locale === "es" ? "Revisa" : "Check the",
    );
    await email.fill("fictional@example.invalid");
    await page
      .getByRole("button", {
        name: locale === "es" ? "Comprobar vista previa" : "Check preview",
      })
      .click();
    await expect(page.getByRole("status")).toContainText(
      locale === "es" ? "no se ha enviado" : "has not been submitted",
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
    await page.reload();
    await expect(email).toHaveValue("creator@example.invalid");
    expect(submissions).toEqual([]);
    await page
      .getByRole("link", {
        name: locale === "es" ? "EN — English" : "ES — Español",
        exact: true,
      })
      .click();
    await expect(page).toHaveURL(
      new RegExp(`/${locale === "es" ? "en" : "es"}/apply$`),
    );
  });
}

test("private review route and endpoint deny forged visitor claims", async ({
  request,
}) => {
  for (const path of [
    "/es/hq/applications",
    "/en/hq/applications",
    "/en/hq/applications?_rsc=forged",
  ]) {
    const response = await request.get(path, {
      headers: {
        cookie: "pilot-role=owner",
        "x-middleware-subrequest": "proxy:proxy:proxy:proxy:proxy",
        rsc: "1",
      },
    });
    expect([404, 503]).toContain(response.status());
    expect(await response.text()).not.toContain("DEMO-001");
    expect(response.headers()["cache-control"]).toContain("no-store");
  }
  const data = await request.get(
    "/auth/review-preview?role=owner&approved=true",
  );
  expect(data.status()).toBe(503);
  expect(await data.text()).not.toContain("applications");
  expect(
    (
      await request.post("/auth/review-preview", {
        data: { role: "owner", decision: "approved" },
      })
    ).status(),
  ).toBe(405);
});
