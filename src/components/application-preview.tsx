"use client";
import { useState, type FormEvent } from "react";
import {
  applicationSchema,
  platforms,
  type ApplicationFields,
} from "@/lib/pilot/applications";
import { getApplicationCopy } from "@/lib/i18n/applications";
import type { Locale } from "@/lib/i18n/config";

const sample: ApplicationFields = {
  name: "Creator Demo",
  email: "creator@example.invalid",
  country: "Colombia",
  platform: "tiktok",
  profile: "https://example.invalid/creator",
};
export function ApplicationPreview({ locale }: { locale: Locale }) {
  const copy = getApplicationCopy(locale);
  const [fields, setFields] = useState(sample);
  const [errors, setErrors] = useState<string[]>([]);
  const [checked, setChecked] = useState(false);
  function check(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = applicationSchema.safeParse(fields);
    setErrors(
      result.success
        ? []
        : result.error.issues.map((issue) => String(issue.path[0])),
    );
    setChecked(result.success);
  }
  return (
    <section
      className="application-form-panel"
      aria-labelledby="application-form-title"
    >
      <div className="application-form-top">
        <span className="eyebrow">01 / GG&apos;S</span>
        <span className="preview-pill">{copy.preview}</span>
      </div>
      <h2 id="application-form-title">{copy.formTitle}</h2>
      <p>{copy.formDescription}</p>
      <form onSubmit={check} autoComplete="off" noValidate>
        <div className="application-fields">
          {(Object.keys(sample) as (keyof ApplicationFields)[]).map((key) => (
            <div
              className={key === "profile" ? "application-wide" : ""}
              key={key}
            >
              <label htmlFor={`application-${key}`}>{copy.fields[key]}</label>
              {key === "platform" ? (
                <select
                  id={`application-${key}`}
                  value={fields.platform}
                  onChange={(event) => {
                    setFields({
                      ...fields,
                      platform: event.target
                        .value as ApplicationFields["platform"],
                    });
                    setChecked(false);
                  }}
                >
                  {platforms.map((platform) => (
                    <option key={platform} value={platform}>
                      {platform === "other"
                        ? copy.other
                        : (
                            {
                              tiktok: "TikTok",
                              twitch: "Twitch",
                              youtube: "YouTube",
                            } as const
                          )[platform]}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id={`application-${key}`}
                  type={
                    key === "email"
                      ? "email"
                      : key === "profile"
                        ? "url"
                        : "text"
                  }
                  value={fields[key]}
                  maxLength={
                    key === "profile" ? 300 : key === "email" ? 254 : 80
                  }
                  required
                  aria-invalid={errors.includes(key)}
                  aria-describedby={
                    errors.includes(key)
                      ? "application-result"
                      : key === "profile"
                        ? "profile-help"
                        : undefined
                  }
                  onChange={(event) => {
                    setFields({ ...fields, [key]: event.target.value });
                    setChecked(false);
                  }}
                />
              )}
              {key === "profile" && (
                <p id="profile-help" className="field-hint">
                  {copy.profileHelp}
                </p>
              )}
            </div>
          ))}
        </div>
        <button className="button-link button-primary" type="submit">
          {copy.button}
          <span aria-hidden="true">↗</span>
        </button>
        <p id="application-result" role="status">
          {checked
            ? copy.checked
            : errors.length > 0
              ? copy.invalid
              : copy.notice}
        </p>
      </form>
    </section>
  );
}
