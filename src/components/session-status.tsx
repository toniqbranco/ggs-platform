"use client";
import { useEffect, useState } from "react";
import type { Locale } from "@/lib/i18n/config";
import { getAuthCopy } from "@/lib/i18n/auth";

export function SessionStatus({
  locale,
  storedReviewEnabled = false,
}: {
  locale: Locale;
  storedReviewEnabled?: boolean;
}) {
  const copy = getAuthCopy(locale);
  const [status, setStatus] = useState<
    "checking" | "verified" | "absent" | "offline" | "restricted"
  >("checking");
  const [ownerReview, setOwnerReview] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/auth/session", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (controller.signal.aborted) return;
        if (!response.ok) {
          setStatus("offline");
          return;
        }
        const data = await response.json();
        if (controller.signal.aborted) return;
        setStatus(
          data.accessDenied === true
            ? "restricted"
            : data.authenticated === true && data.approved === true
              ? "verified"
              : "absent",
        );
        if (
          storedReviewEnabled &&
          data.authenticated === true &&
          data.approved === true
        ) {
          const access = await fetch("/auth/access?area=pilot-management", {
            cache: "no-store",
            signal: controller.signal,
          });
          if (
            access.ok &&
            (await access.json()).allowed === true &&
            !controller.signal.aborted
          )
            setOwnerReview(true);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus("offline");
      });
    return () => controller.abort();
  }, [storedReviewEnabled]);
  return (
    <section className="auth-card" aria-labelledby="session-title">
      <p className="eyebrow">{copy.eyebrow}</p>
      <h1 id="session-title">{copy.sessionTitle}</h1>
      <p role="status" className="auth-message">
        {storedReviewEnabled && ownerReview && status === "verified"
          ? copy.ownerVerified
          : copy[status]}
      </p>
      {status === "verified" && (
        <form action="/auth/sign-out" method="post">
          <input name="locale" type="hidden" value={locale} />
          <button className="button-link button-primary" type="submit">
            {copy.signOut}
          </button>
        </form>
      )}
      {storedReviewEnabled && ownerReview && status === "verified" && (
        <p>
          <a
            className="button-link button-primary"
            href={`/${locale}/hq/applications`}
          >
            {copy.openReview}
          </a>
        </p>
      )}
      <p>{copy.boundary}</p>
      {status !== "verified" && (
        <a href={`/${locale}/sign-in`}>{copy.signIn}</a>
      )}
    </section>
  );
}
