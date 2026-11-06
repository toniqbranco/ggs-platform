import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n/config";
import { localSetupEnabled, localSetupHost } from "@/lib/setup-local/gate";
import { LocalSetup } from "@/components/local-setup";
export const dynamic = "force-dynamic";
export const metadata = {
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default async function LocalSetupPage({
  params,
}: PageProps<"/[locale]/setup/local">) {
  const { locale } = await params;
  if (
    !isLocale(locale) ||
    !localSetupEnabled(process.env) ||
    !localSetupHost(await headers())
  )
    notFound();
  return <LocalSetup locale={locale} />;
}
