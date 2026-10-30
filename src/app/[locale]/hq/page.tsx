import { PilotEntry } from "@/components/pilot-entry";
import { getPilotMetadata } from "@/lib/i18n/pilot-metadata";

export function generateMetadata({ params }: PageProps<"/[locale]/hq">) {
  return getPilotMetadata(params, "hq");
}

export default function Headquarters({ params }: PageProps<"/[locale]/hq">) {
  return <PilotEntry params={params} area="hq" />;
}
