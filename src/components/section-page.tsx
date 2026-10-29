import Link from "next/link";
import { notFound } from "next/navigation";
import { isLocale, sectionHref } from "@/lib/i18n/config";
import type { Section } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { Shell } from "./shell";
import { Badge } from "./ui/badge";
import { Panel } from "./ui/panel";

export async function SectionPage({
  params,
  section,
}: {
  params: Promise<{ locale: string }>;
  section: Section;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const copy = getDictionary(locale);
  const content = copy.sections[section];
  return (
    <Shell locale={locale} section={section}>
      <div className="page-intro">
        <div className="eyebrow-row">
          <p className="eyebrow">{content.eyebrow}</p>
          <Badge>{copy.availability}</Badge>
        </div>
        <h1>{content.title}</h1>
        <p className="intro-description">{content.description}</p>
      </div>
      <Panel title={content.panelTitle}>
        <p>{content.panelDescription}</p>
        {section !== "public" && (
          <Link className="button-link" href={sectionHref(locale, "public")}>
            {copy.backHome}
            <span aria-hidden="true">↗</span>
          </Link>
        )}
      </Panel>
    </Shell>
  );
}
