import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import localFont from "next/font/local";
import "../globals.css";
import { isLocale, locales } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";

const roboto = localFont({
  src: "../../../node_modules/@fontsource-variable/roboto/files/roboto-latin-wght-normal.woff2",
  weight: "100 900",
  display: "swap",
  variable: "--font-roboto",
});

type Props = { children: ReactNode; params: Promise<{ locale: string }> };

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return getDictionary(locale).metadata;
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return (
    <html lang={locale} className={roboto.variable}>
      <body>{children}</body>
    </html>
  );
}
