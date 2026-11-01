import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n/config";
import { OwnerReviewPreview } from "@/components/owner-review-preview";
import { OwnerStoredReview } from "@/components/owner-stored-review";
import { getServerEnvironment } from "@/lib/env/server";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "GG's · Private review",
  robots: { index: false, follow: false },
};
export default async function Applications({
  params,
}: PageProps<"/[locale]/hq/applications">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  if (getServerEnvironment().PILOT_REVIEW_STORAGE_ENABLED === "true")
    return <OwnerStoredReview key={locale} locale={locale} />;
  return <OwnerReviewPreview locale={locale} />;
}
