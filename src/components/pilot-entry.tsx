import Link from "next/link";
import { notFound } from "next/navigation";
import { isLocale, pilotPageHref, sectionHref } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { getPilotCopy } from "@/lib/i18n/pilot";
import { getPilotAuthConfig } from "@/lib/auth/server";
import { getAuthCopy } from "@/lib/i18n/auth";
import { Shell } from "./shell";
import { Badge } from "./ui/badge";
import { Icon } from "./ui/icon";

export async function PilotEntry({
  params,
  area,
}: {
  params: Promise<{ locale: string }>;
  area: "streamer";
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const base = getDictionary(locale);
  const copy = getPilotCopy(locale);
  const authConfig = getPilotAuthConfig();
  const authEnabled = authConfig.enabled && !!authConfig.ownerUserId;
  const authCopy = getAuthCopy(locale);
  const section = base.sections[area];

  return (
    <Shell locale={locale} section={area}>
      <div className="pilot-entry" data-pilot-entry={area}>
        <div className="pilot-story">
          <p className="eyebrow">
            <span className="square-dot" />
            {copy.eyebrow} / {section.label}
          </p>
          <h1>
            {section.title} <span>{section.accent}</span>
          </h1>
          <p className="intro-description">{copy.entryDescription}</p>
          <div className="pilot-trust">
            <Icon name="spark" />
            <div>
              <h2>{copy.trustLabel}</h2>
              <p>{copy.trustDescription}</p>
            </div>
          </div>
          <Link className="pilot-back" href={sectionHref(locale, "public")}>
            {copy.backHome}
            <Icon name="arrow" />
          </Link>
        </div>
        <section className="pilot-card" aria-labelledby="pilot-entry-title">
          <div className="pilot-card-top">
            <span className="pilot-lock">
              <Icon name="lock" />
            </span>
            <Badge>{copy.preview}</Badge>
          </div>
          <p className="eyebrow">{copy.invitationOnly}</p>
          <h2 id="pilot-entry-title">{copy.entryTitle}</h2>
          <ol className="pilot-steps" aria-label={copy.stepsLabel}>
            {copy.steps.map((step, index) => (
              <li key={step.title}>
                <span className="pilot-step-number" aria-hidden="true">
                  0{index + 1}
                </span>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.description}</p>
                </div>
              </li>
            ))}
          </ol>
          <p id="pilot-availability" className="pilot-availability">
            {authEnabled ? authCopy.boundary : copy.availability}
          </p>
          {authEnabled ? (
            <Link
              className="button-link button-primary"
              href={`/${locale}/sign-in`}
            >
              {authCopy.signIn}
              <Icon name="lock" />
            </Link>
          ) : (
            <button
              type="button"
              className="button-link pilot-signin"
              disabled
              aria-describedby="pilot-availability"
            >
              {copy.signinSoon}
              <Icon name="lock" />
            </button>
          )}
          <Link
            className="pilot-policy-link"
            href={pilotPageHref(locale, "information")}
          >
            {copy.readPolicy}
            <Icon name="arrow" />
          </Link>
        </section>
      </div>
    </Shell>
  );
}
