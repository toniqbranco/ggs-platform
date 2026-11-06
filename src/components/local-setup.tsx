"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Locale } from "@/lib/i18n/config";
import {
  localSetupViewSchema,
  type LocalSetupView,
  type LocalSetupAction,
} from "@/lib/setup-local/contract";
const copy = {
  es: {
    tag: "LABORATORIO LOCAL · DATOS FICTICIOS",
    title: "Tu próximo\ncapítulo, en vivo.",
    intro:
      "Un recorrido privado pensado para que tu talento encuentre su espacio.",
    notice:
      "Prueba local con datos de ejemplo. No uses tu contraseña ni tus datos personales. No crea cuentas ni da acceso a herramientas.",
    steps: ["Contraseña", "Perfil", "Revisión"],
    startTitle: "Conoce tu nuevo comienzo",
    startText:
      "Recorre una invitación ficticia y descubre cómo será preparar tu perfil de streamer.",
    start: "Empezar prueba",
    loading: "Preparando tu espacio…",
    passwordTitle: "Una base segura",
    passwordText:
      "Esta prueba usa una contraseña ficticia fija. Tu contraseña real no se solicita ni se cambia.",
    password: "Contraseña de prueba",
    passwordAction: "Establecer contraseña de prueba",
    profileTitle: "Un perfil con tu identidad",
    profileText:
      "Revisa este perfil de ejemplo. Por ahora guardamos solo estos datos ficticios.",
    profileAction: "Guardar perfil de ejemplo",
    reviewTitle: "Todo listo para el siguiente paso",
    reviewText:
      "Contraseña y perfil de prueba guardados. Confirma para completar el recorrido local.",
    reviewAction: "Completar prueba",
    completeTitle: "Estás listo para lo que viene",
    completeText:
      "Has completado el recorrido de prueba. Las herramientas de streamer todavía no están disponibles y esto no concede acceso real.",
    reset: "Reiniciar prueba",
    checking: "Comprobando…",
    error:
      "No pudimos completar este paso. Comprueba el estado antes de intentarlo de nuevo.",
    expired: "La sesión de prueba terminó. Inicia un recorrido ficticio nuevo.",
    check: "Comprobar estado",
    receipt: "Comprobar el resultado anterior",
    name: "Nombre",
    country: "País",
    platform: "Plataforma",
    url: "Perfil público",
    footer:
      "Sesión local temporal · Caduca a los 30 minutos o al reiniciar el servidor",
    language: "Switch to English",
  },
  en: {
    tag: "LOCAL LAB · FICTIONAL DATA",
    title: "Your next\nchapter, live.",
    intro: "A private journey designed to give your talent room to grow.",
    notice:
      "Local test with sample data. Do not use your password or personal details. This creates no account or access to tools.",
    steps: ["Password", "Profile", "Review"],
    startTitle: "Meet your next beginning",
    startText:
      "Try a fictional invitation and explore how setting up your streamer profile will feel.",
    start: "Begin test",
    loading: "Preparing your space…",
    passwordTitle: "A secure foundation",
    passwordText:
      "This test uses a fixed fictional password. Your real password is never requested or changed.",
    password: "Test password",
    passwordAction: "Set test password",
    profileTitle: "A profile with your identity",
    profileText:
      "Review this sample profile. For now, only these fictional details can be saved.",
    profileAction: "Save sample profile",
    reviewTitle: "Ready for the next step",
    reviewText:
      "Test password and profile saved. Confirm to complete the local journey.",
    reviewAction: "Complete test",
    completeTitle: "Ready for what comes next",
    completeText:
      "You completed the test journey. Streamer tools are still unavailable and this does not grant real access.",
    reset: "Restart test",
    checking: "Checking…",
    error:
      "We could not complete this step. Check its status before trying again.",
    expired: "Your test session ended. Start a new fictional journey.",
    check: "Check status",
    receipt: "Check previous result",
    name: "Name",
    country: "Country",
    platform: "Platform",
    url: "Public profile",
    footer:
      "Temporary local session · Expires after 30 minutes or on server restart",
    language: "Cambiar a español",
  },
};
async function requestStep(action: LocalSetupAction, signal: AbortSignal) {
  const result = await fetch(`/auth/setup-local/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
    credentials: "same-origin",
    cache: "no-store",
    redirect: "error",
    signal,
  });
  if (result.status === 410) return null;
  if (!result.ok) throw new Error("Step unavailable");
  return localSetupViewSchema.parse(await result.json());
}
export function LocalSetup({ locale }: { locale: Locale }) {
  const c = copy[locale];
  const [view, setView] = useState<LocalSetupView | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<"error" | "expired" | null>(null);
  const lock = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  async function send(action: LocalSetupAction, focus = true) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await requestStep(action, AbortSignal.timeout(10000));
      if (!result) {
        setView(null);
        setError(action === "status" && !view ? null : "expired");
        return;
      }
      setView(result);
    } catch {
      setError("error");
    } finally {
      lock.current = false;
      setBusy(false);
      if (focus) requestAnimationFrame(() => heading.current?.focus());
    }
  }
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    // Reading a session on mount never repeats an invitation or password mutation.
    void requestStep(
      "status",
      AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]),
    )
      .then((result) => {
        if (active) setView(result);
      })
      .catch(() => {
        if (active) setError("error");
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, []);
  const stage = view?.stage;
  const title =
    busy && !view
      ? c.loading
      : stage === "password"
        ? c.passwordTitle
        : stage === "profile"
          ? c.profileTitle
          : stage === "review"
            ? c.reviewTitle
            : stage === "complete"
              ? c.completeTitle
              : c.startTitle;
  const text =
    stage === "password"
      ? c.passwordText
      : stage === "profile"
        ? c.profileText
        : stage === "review"
          ? c.reviewText
          : stage === "complete"
            ? c.completeText
            : c.startText;
  const next: LocalSetupAction =
    stage === "password"
      ? "password"
      : stage === "profile"
        ? "profile"
        : stage === "review"
          ? "finalize"
          : "start";
  const label =
    stage === "password"
      ? c.passwordAction
      : stage === "profile"
        ? c.profileAction
        : stage === "review"
          ? c.reviewAction
          : stage === "complete"
            ? c.reset
            : c.start;
  const fields = [
    [c.name, "GG Demo Creator"],
    [c.country, "Colombia"],
    [c.platform, "Twitch"],
    [c.url, "https://example.invalid/creator"],
  ];
  return (
    <main className="local-setup">
      <header className="local-setup-header">
        <Link href={`/${locale}`} className="local-brand" aria-label="GG's">
          GG<span>’s</span>
        </Link>
        <Link
          href={`/${locale === "es" ? "en" : "es"}/setup/local`}
          prefetch={false}
          aria-label={`${locale === "es" ? "EN" : "ES"} · ${c.language}`}
        >
          {locale === "es" ? "EN" : "ES"} <span aria-hidden="true">↗</span>
        </Link>
      </header>
      <div className="setup-layout">
        <div className="setup-story">
          <p className="eyebrow">
            <span className="square-dot" /> GG’S · TALENT & TECH
          </p>
          <h1>
            {c.title.split("\n").map((line) => (
              <span key={line}>{line}</span>
            ))}
          </h1>
          <p className="intro-description">{c.intro}</p>
          <div className="local-orbit" aria-hidden="true">
            <span>GG’S</span>
            <span>LIVE · CREATE · GROW ·</span>
          </div>
          <p className="local-footnote">{c.footer}</p>
        </div>
        <section
          className="setup-panel"
          aria-labelledby="local-step-title"
          aria-busy={busy}
        >
          <p className="preview-pill">{c.tag}</p>
          <p className="setup-notice">{c.notice}</p>
          <ol
            className="local-progress"
            aria-label={
              locale === "es" ? "Progreso de prueba" : "Test progress"
            }
          >
            {c.steps.map((step, i) => (
              <li
                key={step}
                aria-current={
                  (stage === "password" ? 0 : stage === "profile" ? 1 : 2) ===
                    i && view
                    ? "step"
                    : undefined
                }
              >
                <span aria-hidden="true">0{i + 1}</span>
                {step}
              </li>
            ))}
          </ol>
          <h2 id="local-step-title" tabIndex={-1} ref={heading}>
            {title}
          </h2>
          <p aria-live="polite">{text}</p>
          {stage === "password" && (
            <div className="setup-passwords">
              <label htmlFor="local-password">{c.password}</label>
              <input
                id="local-password"
                type="text"
                value="Fictional-Setup-Password-Only"
                readOnly
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          )}
          {(stage === "profile" || stage === "review") && (
            <dl className="setup-profile">
              {fields.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          )}
          {stage === "complete" && (
            <div className="local-complete" aria-hidden="true">
              ✓
            </div>
          )}
          {error && (
            <p role="alert" className="local-error">
              {c[error]}
            </p>
          )}
          <div className="setup-actions">
            {!error && (
              <button
                type="button"
                className="setup-button"
                disabled={busy}
                onClick={() => void send(next)}
              >
                {busy ? c.checking : label}
                <span aria-hidden="true">↗</span>
              </button>
            )}
            {error && (
              <>
                <button
                  type="button"
                  className="setup-button"
                  disabled={busy}
                  onClick={() => void send("status")}
                >
                  {c.check}
                </button>
                {stage === "password" && (
                  <button
                    type="button"
                    className="local-secondary"
                    disabled={busy}
                    onClick={() => void send("password-receipt")}
                  >
                    {c.receipt}
                  </button>
                )}
                {!view && (
                  <button
                    type="button"
                    className="local-secondary"
                    disabled={busy}
                    onClick={() => void send("start")}
                  >
                    {c.start}
                  </button>
                )}
              </>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
