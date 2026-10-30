import AxeBuilder from "@axe-core/playwright";
import { test, expect, pages } from "./fixtures";

for (const entry of pages) {
  test(`${entry.path} renders without overflow or accessibility violations`, async ({
    page,
  }) => {
    await page.goto(entry.path);
    await expect(page.locator("html")).toHaveAttribute("lang", entry.locale);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      entry.title,
    );
    await expect(page.locator("[data-shell]")).toHaveAttribute(
      "data-shell",
      entry.shell,
    );
    await expect(page.locator(".space-nav [aria-current=page]")).toHaveCount(1);
    await expect(page.getByRole("main")).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true);
    if (entry.shell === "public") {
      const image = page.locator(".creator-photo");
      await expect(image).toBeVisible();
      await expect
        .poll(() =>
          image.evaluate((image) => (image as HTMLImageElement).naturalWidth),
        )
        .toBeGreaterThan(0);
    }
    const accessibility = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(accessibility.violations).toEqual([]);
  });
}

test("language switching preserves the shell and subsequent navigation preserves language", async ({
  page,
}) => {
  await page.goto("/es/hq");
  await page.getByRole("link", { name: "EN — English", exact: true }).click();
  await expect(page).toHaveURL(/\/en\/hq$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await page
    .getByRole("navigation", { name: "GG's spaces" })
    .getByRole("link", { name: "Streamers" })
    .click();
  await expect(page).toHaveURL(/\/en\/streamer$/);
  await page.getByRole("link", { name: "ES — Español", exact: true }).click();
  await expect(page).toHaveURL(/\/es\/streamer$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
});

test("keyboard skip link focuses main and the public CTA reaches its section", async ({
  page,
}) => {
  await page.goto("/en");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to content" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();
  await page.getByRole("link", { name: "Discover GG's" }).click();
  await expect(page).toHaveURL(/#vision$/);
  await expect(page.locator("#vision")).toBeInViewport();
});

test("reduced-motion preference suppresses entrance animation", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/en");
  expect(
    await page
      .locator(".hero-grid")
      .evaluate((element) => getComputedStyle(element).animationName),
  ).toBe("none");
});

test("all localized shells fit a narrow 320px viewport", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  for (const entry of pages) {
    await page.goto(entry.path);
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
      entry.path,
    ).toBe(true);
  }
});
