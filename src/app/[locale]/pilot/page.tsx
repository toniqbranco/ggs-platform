import { PilotInformation } from "@/components/pilot-information";
import { getPilotMetadata } from "@/lib/i18n/pilot-metadata";

export function generateMetadata({ params }: PageProps<"/[locale]/pilot">) {
  return getPilotMetadata(params, "information");
}

export default function PilotPolicy({ params }: PageProps<"/[locale]/pilot">) {
  return <PilotInformation params={params} page="information" />;
}
