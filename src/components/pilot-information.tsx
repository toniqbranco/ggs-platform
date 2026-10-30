import Link from "next/link";
import { notFound } from "next/navigation";
import { isLocale, pilotPageHref, sectionHref } from "@/lib/i18n/config";
import type { PilotPage } from "@/lib/i18n/config";
import { getPilotCopy } from "@/lib/i18n/pilot";
import { Shell } from "./shell";
import { Badge } from "./ui/badge";
import { Icon } from "./ui/icon";

export async function PilotInformation({
  params,
  page,
}: {
  params: Promise<{ locale: string }>;
  page: PilotPage;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const copy = getPilotCopy(locale);
  const content = copy[page];
  return (
    <Shell locale={locale} section="public" pilotPage={page}>
      <section className="pilot-information" data-pilot-page={page}>
        <div className="pilot-info-top">
          <span className="pilot-lock">
            <Icon name={page === "denied" ? "lock" : "spark"} />
          </span>
          <Badge>{copy.preview}</Badge>
        </div>
        <p className="eyebrow">
          {copy.eyebrow} / {copy.invitationOnly}
        </p>
        <h1>{content.title}</h1>
        <p className="intro-description">{content.description}</p>
        <p className="pilot-info-note">{content.note}</p>
        {page === "information" && (
          <section
            className="pilot-audiences"
            aria-labelledby="pilot-audience-title"
          >
            <h2 id="pilot-audience-title">{copy.audienceLabel}</h2>
            <div>
              {copy.audience.map((item) => (
                <article key={item.name}>
                  <h3>{item.name}</h3>
                  <p>{item.description}</p>
                </article>
              ))}
            </div>
          </section>
        )}
        <div className="pilot-info-actions">
          <Link
            className="button-link button-primary"
            href={sectionHref(locale, "public")}
          >
            {copy.backHome}
            <Icon name="arrow" />
          </Link>
          <Link
            className="pilot-policy-link"
            href={pilotPageHref(
              locale,
              page === "denied" ? "information" : "denied",
            )}
          >
            {page === "denied" ? copy.readPolicy : copy.withoutInvitation}
            <Icon name="arrow" />
          </Link>
        </div>
      </section>
    </Shell>
  );
}
