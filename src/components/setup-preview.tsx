import Link from "next/link";
import type { Locale } from "@/lib/i18n/config";
import { getSetupCopy, type SetupStep } from "@/lib/i18n/setup";

// Entirely server-rendered fictional display. No form or credential input handler.
export function SetupPreview({
  locale,
  step,
}: {
  locale: Locale;
  step: SetupStep;
}) {
  const copy = getSetupCopy(locale);
  const profile = step === "profile";
  const fields = [
    [copy.name, "Stream Talents Demo Creator"],
    [copy.email, "creator@example.invalid"],
    [copy.country, "Colombia"],
    [copy.language, locale === "es" ? "Español" : "English"],
    [copy.platform, "Twitch"],
    [copy.url, "https://example.invalid/creator"],
  ];
  return (
    <div className="setup-layout">
      <div className="setup-story">
        <p className="eyebrow">
          <span className="square-dot" /> {copy.eyebrow}
        </p>
        <h1>
          {copy.title.split("\n").map((line) => (
            <span key={line}>{line}</span>
          ))}
        </h1>
        <p className="intro-description">{copy.intro}</p>
        <div className="setup-promise">
          <span aria-hidden="true">↗</span>
          <h2>{copy.promise}</h2>
          <p>{copy.detail}</p>
        </div>
        <Link href={`/${locale}/sign-in`} prefetch={false}>
          {copy.signIn}
        </Link>
      </div>
      <section className="setup-panel" aria-labelledby="setup-title">
        <p className="preview-pill">{copy.preview}</p>
        <p className="setup-notice">{copy.notice}</p>
        <nav aria-label={copy.navigation} className="setup-steps">
          {(["password", "profile"] as const).map((item, index) => (
            <Link
              key={item}
              href={`/${locale}/setup?step=${item}`}
              prefetch={false}
              aria-current={step === item ? "step" : undefined}
            >
              <span aria-hidden="true">0{index + 1}</span>
              {copy.steps[index]}
            </Link>
          ))}
        </nav>
        <h2 id="setup-title">
          {profile ? copy.profileTitle : copy.passwordTitle}
        </h2>
        <p>{profile ? copy.profileIntro : copy.passwordIntro}</p>
        {profile ? (
          <dl className="setup-profile">
            {fields.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <div className="setup-passwords">
            {[copy.password, copy.confirm].map((label, index) => (
              <div key={label}>
                <label htmlFor={`setup-password-${index}`}>{label}</label>
                <input
                  id={`setup-password-${index}`}
                  type="password"
                  disabled
                  value=""
                  placeholder="••••••••••••"
                  aria-describedby="setup-password-hint"
                />
              </div>
            ))}
            <p id="setup-password-hint">{copy.passwordHint}</p>
          </div>
        )}
        <div className="setup-actions">
          {profile ? (
            <>
              <button type="button" disabled className="setup-button">
                {copy.save}
              </button>
              <Link prefetch={false} href={`/${locale}/setup?step=password`}>
                {copy.back}
              </Link>
            </>
          ) : (
            <Link
              className="setup-button"
              prefetch={false}
              href={`/${locale}/setup?step=profile`}
            >
              {copy.next}
              <span aria-hidden="true">↗</span>
            </Link>
          )}
        </div>
        <p className="setup-ending">{copy.ending}</p>
      </section>
    </div>
  );
}
