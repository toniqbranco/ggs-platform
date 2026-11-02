import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n/config";
import { readSetupStep } from "@/lib/i18n/setup";
import { Shell } from "@/components/shell";
import { SetupPreview } from "@/components/setup-preview";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

export default async function Setup({
  params,
  searchParams,
}: PageProps<"/[locale]/setup">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const step = readSetupStep((await searchParams).step);
  return (
    <Shell locale={locale} section="streamer" authPage="setup" setupStep={step}>
      <SetupPreview locale={locale} step={step} />
    </Shell>
  );
}
