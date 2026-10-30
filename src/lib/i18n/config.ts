export const locales = ["es", "en"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "es";

export function isLocale(value: string): value is Locale {
  return locales.some((locale) => locale === value);
}

export const sections = ["public", "hq", "streamer"] as const;
export type Section = (typeof sections)[number];

export function sectionHref(locale: Locale, section: Section) {
  return section === "public" ? `/${locale}` : `/${locale}/${section}`;
}
