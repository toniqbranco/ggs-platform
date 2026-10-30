export const locales = ["es", "en"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "es";

export function isLocale(value: string): value is Locale {
  return locales.some((locale) => locale === value);
}

export const sections = ["public", "streamer"] as const;
export type Section = (typeof sections)[number];

const pilotPaths = { information: "pilot", denied: "access-denied" } as const;
export type PilotPage = keyof typeof pilotPaths;

export function pilotPageHref(locale: Locale, page: PilotPage) {
  return `/${locale}/${pilotPaths[page]}`;
}

export function sectionHref(locale: Locale, section: Section) {
  return section === "public" ? `/${locale}` : `/${locale}/${section}`;
}
