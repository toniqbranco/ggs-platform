import Link from "next/link";
import { notFound } from "next/navigation";
import { isLocale, sectionHref } from "@/lib/i18n/config";
import type { Section } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { Shell } from "./shell";
import { Badge } from "./ui/badge";
import { Panel } from "./ui/panel";
import { HeroVisual } from "./hero-visual";
import { Icon } from "./ui/icon";

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
      <div className="hero-grid">
        <div className="page-intro">
          <p className="eyebrow">
            <span className="square-dot" />
            {content.eyebrow}
          </p>
          <h1>
            {content.title} <span>{content.accent}</span>
          </h1>
          <p className="intro-description">{content.description}</p>
          <div className="hero-actions">
            <Link
              className="button-link button-primary"
              href={section === "public" ? "#vision" : "#space-preview"}
            >
              {section === "public" ? copy.discover : copy.spacesLabel}
              <Icon name="arrow" />
            </Link>
            <Badge>{copy.availability}</Badge>
          </div>
          <div className="hero-footnote">
            <Icon name="globe" />
            <span>{copy.brandline}</span>
          </div>
        </div>
        <HeroVisual locale={locale} section={section} />
      </div>
      <div className="pillar-strip">
        {copy.pillars.map((pillar) => (
          <span key={pillar}>
            <Icon name="spark" />
            {pillar}
          </span>
        ))}
      </div>
      {section === "public" && (
        <section
          id="vision"
          className="vision-section"
          aria-labelledby="vision-title"
        >
          <div className="vision-statement">
            <p className="eyebrow">01 / {copy.perspective}</p>
            <h2 id="vision-title">{copy.visionTitle}</h2>
            <p className="vision-description">{copy.visionDescription}</p>
            <div className="vision-signoff">
              <Icon name="globe" />
              <span>{copy.visionNote}</span>
            </div>
            <div className="vision-orbit" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
          </div>
          <div className="principles">
            {copy.principles.map((principle, index) => (
              <div className="principle" key={principle.title}>
                <span className="principle-number">0{index + 1}</span>
                <div>
                  <h3>{principle.title}</h3>
                  <p>{principle.description}</p>
                </div>
                <Icon
                  name={
                    index === 0 ? "spark" : index === 1 ? "signal" : "globe"
                  }
                />
              </div>
            ))}
          </div>
        </section>
      )}
      <div id="space-preview" className="space-preview">
        <Panel title={content.panelTitle}>
          <p>{content.panelDescription}</p>
          <div className="space-links" aria-label={copy.spacesLabel}>
            {section === "public" ? (
              <>
                <Link className="button-link" href={sectionHref(locale, "hq")}>
                  HQ
                  <Icon name="arrow" />
                </Link>
                <Link
                  className="button-link"
                  href={sectionHref(locale, "streamer")}
                >
                  {copy.sections.streamer.label}
                  <Icon name="arrow" />
                </Link>
              </>
            ) : (
              <Link
                className="button-link"
                href={sectionHref(locale, "public")}
              >
                {copy.backHome}
                <Icon name="arrow" />
              </Link>
            )}
          </div>
        </Panel>
      </div>
    </Shell>
  );
}
