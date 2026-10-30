import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n/config";
import { getAuthCopy } from "@/lib/i18n/auth";
import { getPilotAuthConfig } from "@/lib/auth/server";
import { Shell } from "@/components/shell";
export const dynamic = "force-dynamic";
export async function generateMetadata({
  params,
}: PageProps<"/[locale]/sign-in">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return { title: getAuthCopy(locale).title + " · GG's" };
}
export default async function SignIn({
  params,
  searchParams,
}: PageProps<"/[locale]/sign-in">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const copy = getAuthCopy(locale);
  const authConfig = getPilotAuthConfig();
  const enabled = authConfig.enabled && !!authConfig.ownerUserId;
  const { state } = await searchParams;
  const message =
    typeof state === "string" && Object.hasOwn(copy.states, state)
      ? copy.states[state as keyof typeof copy.states]
      : null;
  return (
    <Shell locale={locale} section="streamer" authPage="sign-in">
      <section className="auth-card" aria-labelledby="auth-title">
        <p className="eyebrow">{copy.eyebrow}</p>
        <h1 id="auth-title">{copy.title}</h1>
        <p>{enabled ? copy.description : copy.closedDescription}</p>
        {message && (
          <p role="status" className="auth-message">
            {message}
          </p>
        )}
        {enabled ? (
          <form action="/auth/sign-in" method="post">
            <input type="hidden" name="locale" value={locale} />
            <label htmlFor="email">{copy.email}</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              maxLength={254}
              required
            />
            <button className="button-link button-primary" type="submit">
              {copy.send}
            </button>
          </form>
        ) : (
          <p className="auth-message">{copy.offline}</p>
        )}
        <p>{copy.boundary}</p>
        <a href={"/" + locale + "/streamer"}>{copy.back}</a>
      </section>
    </Shell>
  );
}
