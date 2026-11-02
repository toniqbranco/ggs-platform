import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n/config";
import { getAuthCopy } from "@/lib/i18n/auth";
import { Shell } from "@/components/shell";
import { SessionStatus } from "@/components/session-status";
import { getServerEnvironment } from "@/lib/env/server";
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
  const storedReviewEnabled =
    getServerEnvironment().PILOT_REVIEW_STORAGE_ENABLED === "true";
  return (
    <Shell locale={locale} section="streamer" authPage="session">
      <SessionStatus
        key={`${locale}:${storedReviewEnabled}`}
        locale={locale}
        storedReviewEnabled={storedReviewEnabled}
      />
    </Shell>
  );
}
