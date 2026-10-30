"use client";
import { useEffect, useState } from "react";
import type { Locale } from "@/lib/i18n/config";
import { getAuthCopy } from "@/lib/i18n/auth";

export function SessionStatus({ locale }: { locale: Locale }) {
  const copy = getAuthCopy(locale);
  const [status, setStatus] = useState<
    "checking" | "verified" | "absent" | "offline" | "restricted"
  >("checking");
  useEffect(() => {
    const controller = new AbortController();
    fetch("/auth/session", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          setStatus("offline");
          return;
        }
        const data = await response.json();
        setStatus(
          data.accessDenied === true
            ? "restricted"
            : data.authenticated === true && data.approved === true
              ? "verified"
              : "absent",
        );
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus("offline");
      });
    return () => controller.abort();
  }, []);
  return (
    <section className="auth-card" aria-labelledby="session-title">
      <p className="eyebrow">{copy.eyebrow}</p>
      <h1 id="session-title">{copy.sessionTitle}</h1>
      <p role="status" className="auth-message">
        {copy[status]}
      </p>
      {status === "verified" && (
        <form action="/auth/sign-out" method="post">
          <input name="locale" type="hidden" value={locale} />
          <button className="button-link button-primary" type="submit">
            {copy.signOut}
          </button>
        </form>
      )}
      <p>{copy.boundary}</p>
      <a href={`/${locale}/sign-in`}>{copy.signIn}</a>
    </section>
  );
}
