import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n/config";
import { getAuthCopy } from "@/lib/i18n/auth";
import { Shell } from "@/components/shell";
import { SessionStatus } from "@/components/session-status";
export const dynamic = "force-dynamic";
export async function generateMetadata({
  params,
}: PageProps<"/[locale]/session">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return { title: getAuthCopy(locale).sessionTitle + " · GG's" };
}
export default async function Session({
  params,
}: PageProps<"/[locale]/session">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return (
    <Shell locale={locale} section="streamer" authPage="session">
      <SessionStatus locale={locale} />
    </Shell>
  );
}
