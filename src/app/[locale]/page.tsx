import { SectionPage } from "@/components/section-page";

export default function Home({ params }: PageProps<"/[locale]">) {
  return <SectionPage params={params} section="public" />;
}
