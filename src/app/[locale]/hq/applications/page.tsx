import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n/config";
import { OwnerReviewPreview } from "@/components/owner-review-preview";

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
  return <OwnerReviewPreview locale={locale} />;
}
