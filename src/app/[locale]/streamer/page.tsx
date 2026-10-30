import { SectionPage } from "@/components/section-page";

export default function Streamer({ params }: PageProps<"/[locale]/streamer">) {
  return <SectionPage params={params} section="streamer" />;
}
