import AxeBuilder from "@axe-core/playwright";
import type { BrowserContext } from "@playwright/test";
import { test, expect } from "../e2e/fixtures";

async function identity(
  context: BrowserContext,
  role: "owner" | "streamer" | "admin",
) {
  const sub =
    role === "owner"
      ? "00000000-0000-4000-8000-000000000001"
      : role === "admin"
        ? "00000000-0000-4000-8000-000000000003"
        : "00000000-0000-4000-8000-000000000002";
  const exp = Math.floor(Date.now() / 1000) + 3600;
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

for (const locale of ["es", "en"]) {
  test(`${locale} owner can rehearse a decision without granting access or sending mail`, async ({
    page,
    context,
  }) => {
    await identity(context, "owner");
    const writes: string[] = [];
    page.on("request", (request) => {
      if (request.method() !== "GET") writes.push(request.url());
    });
    const response = await page.goto(`/${locale}/hq/applications`);
    expect(response?.status()).toBe(200);
    expect(response?.headers()["cache-control"]).toContain("no-store");
    await expect(
      page.getByRole("heading", { name: "Alex Demo" }),
    ).toBeVisible();
    const approve = page.getByRole("button", {
      name: locale === "es" ? "Ensayar aprobación" : "Rehearse approval",
    });
    await approve.click();
    await expect(
      page.getByRole("heading", {
        name:
          locale === "es" ? "Confirma este ensayo" : "Confirm this rehearsal",
      }),
    ).toBeVisible();
    await page
      .getByRole("button", {
        name: locale === "es" ? "Cancelar" : "Cancel",
        exact: true,
      })
      .click();
    await expect(approve).toBeVisible();
    await approve.click();
    await page
      .getByRole("button", {
        name: locale === "es" ? "Confirmar ensayo" : "Confirm rehearsal",
      })
      .click();
    await expect(page.getByRole("status")).toContainText(
      locale === "es" ? "Ensayo completado" : "Rehearsal complete",
    );
    await expect(
      page.getByText(
        locale === "es" ? "Invitación no enviada" : "Invitation not sent",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(approve).toHaveCount(0);
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
    await page.reload();
    await expect(approve).toBeVisible();
    const reject = page.getByRole("button", {
      name: locale === "es" ? "Ensayar rechazo" : "Rehearse rejection",
    });
    await reject.click();
    await page
      .getByRole("button", {
        name: locale === "es" ? "Confirmar ensayo" : "Confirm rehearsal",
      })
      .click();
    await expect(reject).toHaveCount(0);
    await page
      .getByRole("button", {
        name: locale === "es" ? "Reiniciar vista previa" : "Reset preview",
      })
      .click();
    await expect(approve).toBeVisible();
    expect(writes).toEqual([]);
  });
}

for (const role of ["admin", "streamer"] as const) {
  test(`${role} cannot load owner review HTML, RSC, or records`, async ({
    context,
  }) => {
    await identity(context, role);
    for (const headers of [{}, { rsc: "1", "next-router-prefetch": "1" }]) {
      const response = await context.request.get(
        "/en/hq/applications?role=owner",
        { headers },
      );
      expect(response.status()).toBe(404);
      expect(await response.text()).not.toContain("DEMO-001");
    }
    const data = await context.request.get(
      "/auth/review-preview?area=hq&role=owner",
    );
    expect(data.status()).toBe(403);
    expect(await data.json()).toEqual({ allowed: false });
  });
}
