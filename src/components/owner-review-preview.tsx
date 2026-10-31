"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { Locale } from "@/lib/i18n/config";
import { getApplicationCopy } from "@/lib/i18n/applications";
import {
  previewDecision,
  type PreviewApplication,
  type ReviewState,
} from "@/lib/pilot/applications";

export function OwnerReviewPreview({ locale }: { locale: Locale }) {
  const copy = getApplicationCopy(locale);
  const [records, setRecords] = useState<PreviewApplication[] | null>(null);
  const [initial, setInitial] = useState<PreviewApplication[]>([]);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState("DEMO-001");
  const [filter, setFilter] = useState<ReviewState | "all">("all");
  const [decision, setDecision] = useState<"approved" | "rejected" | null>(
    null,
  );
  const [done, setDone] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/auth/review-preview", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Access unavailable");
        const data = await response.json();
        if (controller.signal.aborted) return;
        if (data.preview !== true || !Array.isArray(data.applications))
          throw new Error("Invalid preview");
        setInitial(data.applications);
        setRecords(data.applications);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, []);
  const current = records?.find((record) => record.id === selected);
  const visible =
    records?.filter((record) => filter === "all" || record.state === filter) ??
    [];
  if (!records)
    return (
      <main className="review-loading">
        <h1>{copy.reviewEyebrow}</h1>
        <p role="status">{failed ? copy.denied : copy.checking}</p>
        {failed && <a href={`/${locale}/sign-in`}>{copy.signIn}</a>}
      </main>
    );
  return (
    <div className="review-shell">
      <a className="skip-link" href="#main-content">
        {locale === "es" ? "Saltar al contenido" : "Skip to content"}
      </a>
      <header className="review-header">
        <a className="wordmark" href={`/${locale}`}>
          GG&apos;s.
        </a>
        <span className="eyebrow">PRIVATE HQ</span>
        <nav aria-label={locale === "es" ? "Idioma" : "Language"}>
          <Link
            prefetch={false}
            href="/es/hq/applications"
            lang="es"
            aria-current={locale === "es" ? "page" : undefined}
          >
            ES
          </Link>
          <Link
            prefetch={false}
            href="/en/hq/applications"
            lang="en"
            aria-current={locale === "en" ? "page" : undefined}
          >
            EN
          </Link>
        </nav>
        <form action="/auth/sign-out" method="post">
          <input type="hidden" name="locale" value={locale} />
          <button type="submit">{copy.signOut}</button>
        </form>
      </header>
      <main id="main-content" className="review-main" tabIndex={-1}>
        <div className="review-title-row">
          <div>
            <p className="eyebrow">{copy.reviewEyebrow}</p>
            <h1>{copy.reviewTitle}</h1>
            <p>{copy.reviewIntro}</p>
          </div>
          <span className="preview-pill">{copy.preview}</span>
        </div>
        <p className="preview-notice">{copy.reviewNotice}</p>
        <div className="review-stats">
          {(["pending", "approved", "rejected"] as const).map((state) => (
            <div key={state}>
              <span>{copy[state]}</span>
              <strong>
                {records
                  .filter((record) => record.state === state)
                  .length.toString()
                  .padStart(2, "0")}
              </strong>
            </div>
          ))}
        </div>
        <div className="review-workspace">
          <section className="review-queue" aria-labelledby="queue-title">
            <div className="queue-heading">
              <h2 id="queue-title">{copy.listTitle}</h2>
              <label>
                <span className="sr-only">{copy.all}</span>
                <select
                  value={filter}
                  onChange={(event) => {
                    setFilter(event.target.value as typeof filter);
                    setDecision(null);
                  }}
                >
                  {(["all", "pending", "approved", "rejected"] as const).map(
                    (state) => (
                      <option value={state} key={state}>
                        {state === "all" ? copy.all : copy[state]}
                      </option>
                    ),
                  )}
                </select>
              </label>
            </div>
            <ul>
              {visible.map((record) => (
                <li key={record.id}>
                  <button
                    className="review-record"
                    aria-pressed={selected === record.id}
                    onClick={() => {
                      setSelected(record.id);
                      setDecision(null);
                      setDone(false);
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
                    <span className="sr-only">{copy.select}</span>
                  </button>
                </li>
              ))}
            </ul>
            {visible.length === 0 && <p>{copy.noResults}</p>}
          </section>
          {current && (
            <section className="review-detail" aria-labelledby="creator-title">
              <div className="detail-top">
                <p className="eyebrow">
                  {copy.sample} / {current.id}
                </p>
                <span className={`review-state state-${current.state}`}>
                  {copy[current.state]}
                </span>
              </div>
              <span className="creator-avatar avatar-large" aria-hidden="true">
                {current.name[0]}
              </span>
              <h2 id="creator-title">{current.name}</h2>
              <p>{copy.detailTitle}</p>
              <dl>
                {(Object.keys(copy.fields) as (keyof typeof copy.fields)[]).map(
                  (field) => (
                    <div key={field}>
                      <dt>{copy.fields[field]}</dt>
                      <dd>{current[field]}</dd>
                    </div>
                  ),
                )}
              </dl>
              <p className="invitation-note">{copy.invitation}</p>
              {current.state === "pending" && !decision && (
                <div className="review-actions">
                  <button
                    className="button-link button-primary"
                    onClick={() => {
                      setDecision("approved");
                      setDone(false);
                    }}
                  >
                    {copy.approve}
                  </button>
                  <button
                    className="button-link button-secondary"
                    onClick={() => {
                      setDecision("rejected");
                      setDone(false);
                    }}
                  >
                    {copy.reject}
                  </button>
                </div>
              )}
              {decision && (
                <section
                  className="decision-confirm"
                  aria-labelledby="decision-title"
                >
                  <h3 id="decision-title">{copy.confirmTitle}</h3>
                  <p>
                    {decision === "approved"
                      ? copy.confirmApprove
                      : copy.confirmReject}
                  </p>
                  <div className="review-actions">
                    <button
                      autoFocus
                      className="button-link button-primary"
                      onClick={() => {
                        setRecords(
                          records.map((record) =>
                            record.id === current.id
                              ? {
                                  ...record,
                                  state: previewDecision(
                                    record.state,
                                    decision,
                                  ),
                                }
                              : record,
                          ),
                        );
                        setDecision(null);
                        setDone(true);
                      }}
                    >
                      {copy.confirm}
                    </button>
                    <button
                      className="button-link button-secondary"
                      onClick={() => setDecision(null)}
                    >
                      {copy.cancel}
                    </button>
                  </div>
                </section>
              )}
              <p role="status">{done ? copy.done : ""}</p>
              {current.state === "approved" && <p>{copy.next}</p>}
            </section>
          )}
        </div>
        <button
          className="review-reset"
          onClick={() => {
            setRecords(initial);
            setDecision(null);
            setDone(false);
            setFilter("all");
          }}
        >
          {copy.reset}
        </button>
      </main>
    </div>
  );
}
