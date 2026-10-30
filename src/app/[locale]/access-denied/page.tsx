import { PilotInformation } from "@/components/pilot-information";
import { getPilotMetadata } from "@/lib/i18n/pilot-metadata";

export function generateMetadata({
  params,
}: PageProps<"/[locale]/access-denied">) {
  return getPilotMetadata(params, "denied");
}

export default function RestrictedAccess({
  params,
}: PageProps<"/[locale]/access-denied">) {
  return <PilotInformation params={params} page="denied" />;
}
