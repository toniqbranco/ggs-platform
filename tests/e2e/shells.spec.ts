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
    const signIn = page.getByRole("banner").getByRole("link", {
      name: entry.locale === "es" ? "Iniciar sesión" : "Sign in",
      exact: true,
    });
    await expect(signIn).toBeVisible();
    await expect(signIn).toHaveAttribute("href", `/${entry.locale}/sign-in`);
    await page.evaluate(() => document.fonts.ready);
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true);
    if (entry.shell === "public") {
      const image = page.locator("#introduction img");
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
  await page.goto("/es");
  await page.locator(".home-language summary").click();
  await page.getByRole("link", { name: "English", exact: true }).click();
  await expect(page).toHaveURL(/\/en$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await page
    .getByRole("navigation", { name: "Stream Talents spaces" })
    .getByRole("link", { name: "Streamers" })
    .click();
  await expect(page).toHaveURL(/\/en\/streamer$/);
  await page.getByRole("link", { name: "ES — Español", exact: true }).click();
  await expect(page).toHaveURL(/\/es\/streamer$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
});

test("keyboard skip link focuses the seven-section homepage", async ({
  page,
}) => {
  await page.goto("/en");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to content" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();
  await expect(page.getByRole("main").getByRole("region")).toHaveCount(7);
  await expect(
    page.getByRole("button", { name: "I am a streamer" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "I am a brand" }),
  ).toBeDisabled();
});

test("reduced-motion preference suppresses entrance animation", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/en");
  expect(
    await page
      .locator("#introduction")
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

test("Spanish homepage controls fit at 320px and remember the selected theme", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/es");
  const header = page.getByRole("banner");
  const theme = header.getByRole("button", { name: "Tema claro" });
  await expect(theme).toHaveAttribute("aria-pressed", "false");
  await theme.click();
  await expect(theme).toHaveAttribute("aria-pressed", "true");
  await header.getByText("Descubre", { exact: true }).click();
  await expect(
    header.getByText("Academia para streamers", { exact: true }),
  ).toBeInViewport();
  const signIn = header.getByRole("link", { name: "Iniciar sesión" });
  await expect(signIn).toBeInViewport();
  await expect(signIn).toHaveAttribute("href", "/es/sign-in");
  await page.locator(".home-language summary").click();
  await expect(header.getByText("中文", { exact: true })).toBeInViewport();
  await header.getByRole("link", { name: "English", exact: true }).click();
  await expect(page).toHaveURL(/\/en$/);
  await expect(
    header.getByRole("button", { name: "Light theme" }),
  ).toHaveAttribute("aria-pressed", "true");
});
