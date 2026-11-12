"use client";
import Link from "next/link";
import { BrandLogo } from "./brand-logo";
import { useEffect, useState } from "react";
import { z } from "zod";
import type { Locale } from "@/lib/i18n/config";
import { getStoredReviewCopy } from "@/lib/i18n/stored-review";
import {
  storedApplicationSchema,
  storedEventSchema,
  type StoredApplication,
  type StoredEvent,
} from "@/lib/pilot/stored-review-contract";

const list = z.object({
  mode: z.literal("stored-readonly"),
  applications: z.array(storedApplicationSchema).max(50),
});
const history = z.object({
  mode: z.literal("stored-readonly"),
  events: z.array(storedEventSchema).max(2),
});
export function OwnerStoredReview({ locale }: { locale: Locale }) {
  const copy = getStoredReviewCopy(locale);
  const [records, setRecords] = useState<StoredApplication[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [events, setEvents] = useState<StoredEvent[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/auth/application-review?operation=list", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const data = list.parse(await response.json());
        if (!controller.signal.aborted) setRecords(data.applications);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setRecords(null);
          setSelected(null);
          setEvents(null);
          setFailed(true);
        }
      });
    return () => controller.abort();
  }, [refresh]);
  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    fetch(
      `/auth/application-review?operation=history&applicationId=${encodeURIComponent(selected)}`,
      { cache: "no-store", signal: controller.signal },
    )
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const data = history.parse(await response.json());
        if (!controller.signal.aborted) setEvents(data.events);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setRecords(null);
          setSelected(null);
          setEvents(null);
          setFailed(true);
        }
      });
    return () => controller.abort();
  }, [selected]);
  const current = records?.find((record) => record.id === selected);
  return (
    <div className="review-shell">
      <a className="skip-link" href="#main-content">
        {locale === "es" ? "Saltar al contenido" : "Skip to content"}
      </a>
      <header className="review-header">
        <a className="wordmark" aria-label="Stream Talents" href={`/${locale}`}>
          <BrandLogo />
        </a>
        <span className="eyebrow">{copy.eyebrow}</span>
        <nav aria-label={locale === "es" ? "Idioma" : "Language"}>
          {(["es", "en"] as const).map((language) => (
            <Link
              key={language}
              href={`/${language}/hq/applications`}
              prefetch={false}
              lang={language}
              aria-current={locale === language ? "page" : undefined}
            >
              {language.toUpperCase()}
            </Link>
          ))}
        </nav>
        <form action="/auth/sign-out" method="post">
          <input type="hidden" name="locale" value={locale} />
          <button type="submit">{copy.signOut}</button>
        </form>
      </header>
      <main className="review-main" id="main-content" tabIndex={-1}>
        <div className="review-title-row">
          <div>
            <p className="eyebrow">{copy.eyebrow}</p>
            <h1>{copy.title}</h1>
          </div>
          <span className="preview-pill">{copy.mode}</span>
        </div>
        <p className="preview-notice">{copy.notice}</p>
        <button
          className="review-refresh"
          type="button"
          onClick={() => {
            setRecords(null);
            setSelected(null);
            setEvents(null);
            setFailed(false);
            setRefresh((value) => value + 1);
          }}
        >
          {copy.refresh}
        </button>
        {!records ? (
          <div className="review-loading">
            <p role="status">{failed ? copy.unavailable : copy.checking}</p>
            {failed && <a href={`/${locale}/sign-in`}>{copy.signIn}</a>}
          </div>
        ) : (
          <div className="review-workspace">
            <section className="review-queue" aria-labelledby="queue-title">
              <div className="queue-heading">
                <h2 id="queue-title">{copy.queue}</h2>
              </div>
              <p className="stored-review-note">{copy.limit}</p>
              {records.length === 0 ? (
                <p className="stored-review-note" role="status">
                  {copy.empty}
                </p>
              ) : (
                <ul>
                  {records.map((record) => (
                    <li key={record.id}>
                      <button
                        type="button"
                        className="review-record"
                        aria-pressed={selected === record.id}
                        onClick={() => {
                          if (selected === record.id) return;
                          setEvents(null);
                          setSelected(record.id);
                        }}
                      >
                        <span className="creator-avatar" aria-hidden="true">
                          {record.name[0]}
                        </span>
                        <span className="record-name">
                          <strong>{record.name}</strong>
                          <span>
                            {record.platform} · {record.country}
                          </span>
                        </span>
                        <span className={`review-state state-${record.state}`}>
                          {copy[record.state]}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="review-detail" aria-labelledby="detail-title">
              <p className="eyebrow">{copy.detail}</p>
              <h2 id="detail-title">{current?.name ?? copy.select}</h2>
              {current && (
                <>
                  <p className={`review-state state-${current.state}`}>
                    {copy[current.state]}
                  </p>
                  <dl>
                    {[
                      [copy.email, current.email],
                      [copy.country, current.country],
                      [copy.platform, current.platform],
                      [copy.revision, String(current.revision)],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <dt>{label}</dt>
                        <dd>{value}</dd>
                      </div>
                    ))}
                    <div>
                      <dt>{copy.profile}</dt>
                      <dd>
                        <a
                          href={current.profile}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {current.profile}
                        </a>
                      </dd>
                    </div>
                  </dl>
                  <h3>{copy.history}</h3>
                  {events ? (
                    <ol className="stored-review-history">
                      {events.map((event) => (
                        <li key={event.revision}>
                          <strong>{copy[event.kind]}</strong>
                          <span>
                            {copy.revision} {event.revision}
                          </span>
                          <time dateTime={event.occurredAt}>
                            {new Intl.DateTimeFormat(locale, {
                              dateStyle: "medium",
                              timeStyle: "short",
                              timeZone: "UTC",
                            }).format(new Date(event.occurredAt))}{" "}
                            UTC
                          </time>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p role="status">{copy.historyLoading}</p>
                  )}
                </>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
