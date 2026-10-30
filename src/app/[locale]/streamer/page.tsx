import { PilotEntry } from "@/components/pilot-entry";
import { getPilotMetadata } from "@/lib/i18n/pilot-metadata";

export function generateMetadata({ params }: PageProps<"/[locale]/streamer">) {
  return getPilotMetadata(params, "streamer");
}

export default function Streamer({ params }: PageProps<"/[locale]/streamer">) {
  return <PilotEntry params={params} area="streamer" />;
}
