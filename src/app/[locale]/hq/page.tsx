import { SectionPage } from "@/components/section-page";

export default function Headquarters({ params }: PageProps<"/[locale]/hq">) {
  return <SectionPage params={params} section="hq" />;
}
