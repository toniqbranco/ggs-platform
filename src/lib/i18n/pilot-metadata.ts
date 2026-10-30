import "server-only";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale } from "./config";
import type { PilotPage } from "./config";
import { getDictionary } from "./dictionaries";
import { getPilotCopy } from "./pilot";

export async function getPilotMetadata(
  params: Promise<{ locale: string }>,
  target: "hq" | "streamer" | PilotPage,
): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const copy = getPilotCopy(locale);
  if (target === "hq" || target === "streamer") {
    return {
      title: `${getDictionary(locale).sections[target].label} · ${copy.invitationOnly} · GG's`,
      description: copy.entryDescription,
    };
  }
  return {
    title: `${copy[target].title} · GG's`,
    description: copy[target].description,
  };
}
