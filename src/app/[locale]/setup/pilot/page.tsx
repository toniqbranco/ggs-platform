import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n/config";
import { Shell } from "@/components/shell";
import { PilotSetupStatus } from "@/components/pilot-setup-status";
import {
  getPilotSetupConfig,
  matchesPilotSetupHost,
} from "@/lib/pilot/setup-status";

export const dynamic = "force-dynamic";
export const metadata = {
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function PilotSetupPage({
  params,
}: PageProps<"/[locale]/setup/pilot">) {
  const { locale } = await params;
  if (
    !isLocale(locale) ||
    !getPilotSetupConfig() ||
    !matchesPilotSetupHost(await headers())
  )
    notFound();
  return (
    <Shell locale={locale} section="streamer">
      <PilotSetupStatus locale={locale} />
    </Shell>
  );
}
