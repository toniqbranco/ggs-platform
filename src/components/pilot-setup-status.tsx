"use client";

import { useState } from "react";
import Link from "next/link";
import type { Locale } from "@/lib/i18n/config";

const copy = {
  es: {
    title: "Configuración del piloto",
    intro: "Consulta el estado de tu acceso de streamer.",
    check: "Consultar estado",
    loading: "Comprobando tu acceso…",
    complete: "Configuración completada.",
    pending: "Tu configuración está en curso.",
    denied:
      "Inicia sesión con el correo de tu invitación y vuelve a comprobarlo.",
    unavailable: "No pudimos consultar tu estado. Inténtalo de nuevo.",
    signIn: "Iniciar sesión",
  },
  en: {
    title: "Pilot setup",
    intro: "Check the status of your streamer access.",
    check: "Check setup status",
    loading: "Checking your access…",
    complete: "Setup is complete.",
    pending: "Your setup is in progress.",
    denied: "Sign in with the email from your invitation and check again.",
    unavailable: "We couldn’t check your status. Try again.",
    signIn: "Sign in",
  },
};

export function PilotSetupStatus({ locale }: { locale: Locale }) {
  const c = copy[locale];
  const [status, setStatus] = useState<
    "pending" | "complete" | "denied" | "unavailable" | "loading" | null
  >(null);
  async function check() {
    setStatus("loading");
    try {
      const result = await fetch("/auth/setup-status", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(25000),
      });
      if (result.status === 403) return setStatus("denied");
      if (!result.ok) return setStatus("unavailable");
      const data = await result.json();
      setStatus(
        data.status === "complete" || data.status === "pending"
          ? data.status
          : "unavailable",
      );
    } catch {
      setStatus("unavailable");
    }
  }
  const otherLocale = locale === "es" ? "en" : "es";
  return (
    <section className="setup-panel" aria-labelledby="pilot-setup-title">
      <h1 id="pilot-setup-title">{c.title}</h1>
      <p>{c.intro}</p>
      <div className="setup-actions">
        <button
          type="button"
          className="setup-button"
          disabled={status === "loading"}
          onClick={() => void check()}
        >
          {c.check}
        </button>
        <p role="status">{status ? c[status] : ""}</p>
        {status === "denied" && (
          <Link href={`/${locale}/sign-in`}>{c.signIn}</Link>
        )}
        <Link href={`/${otherLocale}/setup/pilot`} lang={otherLocale}>
          {locale === "es" ? "English" : "Español"}
        </Link>
      </div>
    </section>
  );
}
