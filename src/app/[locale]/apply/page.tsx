import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n/config";
import { getApplicationCopy } from "@/lib/i18n/applications";
import { Shell } from "@/components/shell";
import { ApplicationPreview } from "@/components/application-preview";

export default async function Apply({ params }: PageProps<"/[locale]/apply">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const copy = getApplicationCopy(locale);
  return (
    <Shell locale={locale} section="streamer" authPage="apply">
      <div className="application-layout">
        <div className="application-story">
          <p className="eyebrow">
            <span className="square-dot" />
            {copy.eyebrow}
          </p>
          <h1>{copy.title}</h1>
          <p className="intro-description">{copy.description}</p>
          <div className="application-path">
            <p className="eyebrow">{copy.path}</p>
            <ol>
              {copy.steps.map(([title, description], index) => (
                <li key={title}>
                  <span aria-hidden="true">0{index + 1}</span>
                  <div>
                    <h2>{title}</h2>
                    <p>{description}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <a href={`/${locale}/sign-in`}>{copy.signIn}</a>
        </div>
        <ApplicationPreview locale={locale} />
      </div>
    </Shell>
  );
}
