import { test as base, expect } from "@playwright/test";

export const test = base.extend({
  page: async ({ page, baseURL }, run) => {
    const externalRequests: string[] = [];
    const errors: string[] = [];
    const origin = new URL(baseURL!).origin;
    page.on("pageerror", (error) => errors.push(error.message));
    await page.routeWebSocket("**", (socket) => {
      externalRequests.push(new URL(socket.url()).origin);
      socket.close();
    });
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (["http:", "https:"].includes(url.protocol) && url.origin !== origin) {
        externalRequests.push(url.origin);
        return route.abort();
      }
      return route.continue();
    });
    await run(page);
    expect(
      externalRequests,
      "The foundation must make no external browser requests",
    ).toEqual([]);
    expect(errors, "No runtime or CSP errors should occur").toEqual([]);
  },
});
export { expect };

export const pages = [
  {
    path: "/es",
    locale: "es",
    shell: "public",
    title: "Talento sin fronteras.",
  },
  {
    path: "/es/streamer",
    locale: "es",
    shell: "streamer",
    title: "Tu voz. Tu horizonte.",
  },
  {
    path: "/en",
    locale: "en",
    shell: "public",
    title: "Talent without limits.",
  },
  {
    path: "/en/streamer",
    locale: "en",
    shell: "streamer",
    title: "Your voice. Your horizon.",
  },
];
