import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BrandLogo } from "@/components/brand-logo";
import { HomeThemeToggle } from "@/components/home-theme-toggle";
import { Icon } from "@/components/ui/icon";
import { isLocale, locales } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { homeSections } from "@/lib/i18n/home";
import "./home.css";

const languageNames = { es: "Español", en: "English" };
const navigation = {
  en: {
    brands: "Brands",
    discover: "Discover",
    items: [
      "How it works?",
      "Streamer Academy",
      "Who we are?",
      "Our Technology",
      "Contact us",
    ],
    theme: "Light theme",
    closing: "LIVE IS ONLY THE BEGINNING.",
  },
  es: {
    brands: "Marcas",
    discover: "Descubre",
    items: [
      "¿Cómo funciona?",
      "Academia para streamers",
      "¿Quiénes somos?",
      "Nuestra tecnología",
      "Contáctanos",
    ],
    theme: "Tema claro",
    closing: "EL DIRECTO ES SOLO EL COMIENZO.",
  },
};

const sharing = {
  en: {
    title: "Stream Talents | The Future Is Live",
    description:
      "Discover live creators, original shows, and new ways for brands to connect with audiences in real time.",
    alt: "Stream Talents. The future is live. A creator wearing headphones beside a studio microphone.",
    locale: "en_US",
  },
  es: {
    title: "Stream Talents | El futuro es en vivo",
    description:
      "Descubre creadores en vivo, shows originales y nuevas formas de conectar marcas con audiencias en tiempo real.",
    alt: "Stream Talents. El futuro es en vivo. Una creadora con audífonos junto a un micrófono de estudio.",
    locale: "es_CO",
  },
};

export async function generateMetadata({
  params,
}: PageProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const { title, description, alt, locale: ogLocale } = sharing[locale];
  const image = {
    url: `/images/share-${locale}.jpg`,
    width: 1200,
    height: 630,
    alt,
  };

  return {
    metadataBase: new URL("https://www.streamtalents.com"),
    openGraph: {
      title,
      description,
      siteName: "Stream Talents",
      url: `/${locale}`,
      type: "website",
      locale: ogLocale,
      alternateLocale: [sharing[locale === "en" ? "es" : "en"].locale],
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}

export default async function Home({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const copy = getDictionary(locale);
  const menu = navigation[locale];

  return (
    <div className="stream-home shell" data-shell="public">
      <a className="skip-link" href="#main-content">
        {copy.skipLink}
      </a>
      <header className="site-header">
        <div className="container home-header">
          <div className="brand-lockup home-brand">
            <Link
              className="wordmark"
              href={`/${locale}`}
              aria-label={copy.homeLabel}
            >
              <BrandLogo />
            </Link>
            <span className="brandline">{copy.brandline}</span>
          </div>
          <nav className="space-nav home-nav" aria-label={copy.navigationLabel}>
            <Link href={`/${locale}`} aria-current="page">
              {copy.sections.public.label}
            </Link>
            <Link href={`/${locale}/streamer`}>
              {copy.sections.streamer.label}
            </Link>
            <span aria-disabled="true">{menu.brands}</span>
            <details className="home-discover">
              <summary>{menu.discover}</summary>
              <ul>
                {menu.items.map((item) => (
                  <li key={item}>
                    <span aria-disabled="true">{item}</span>
                  </li>
                ))}
              </ul>
            </details>
          </nav>
          <div className="home-controls">
            <HomeThemeToggle label={menu.theme} />
            <details className="home-language">
              <summary
                aria-label={`${copy.languageLabel}: ${locale.toUpperCase()}`}
              >
                {locale.toUpperCase()}
              </summary>
              <ul>
                {locales.map((language) => (
                  <li key={language}>
                    <Link
                      href={`/${language}`}
                      lang={language}
                      hrefLang={language}
                      aria-current={locale === language ? "true" : undefined}
                    >
                      {languageNames[language]}
                    </Link>
                  </li>
                ))}
                <li>
                  <span lang="zh" aria-disabled="true">
                    中文
                  </span>
                </li>
              </ul>
            </details>
            <Link
              className="header-sign-in"
              href={`/${locale}/sign-in`}
              prefetch={false}
            >
              {copy.signIn}
            </Link>
          </div>
        </div>
      </header>
      <main id="main-content" className="container home-main" tabIndex={-1}>
        {homeSections[locale].map(
          (
            {
              id,
              eyebrow,
              title,
              accent,
              taglines,
              paragraphs,
              actions,
              image,
              alt,
              caption,
            },
            index,
          ) => {
            const Heading = index === 0 ? "h1" : "h2";
            return (
              <section
                key={id}
                id={id}
                className="home-row"
                aria-labelledby={`${id}-title`}
              >
                <div className="home-copy">
                  <p className="home-eyebrow">
                    <span className="square-dot" aria-hidden="true" />
                    {eyebrow}
                  </p>
                  <Heading id={`${id}-title`}>
                    {title}
                    {accent && (
                      <>
                        {" "}
                        <span>{accent}</span>
                      </>
                    )}
                  </Heading>
                  {taglines?.map((text) => (
                    <p key={text} className="home-tagline">
                      {text}
                    </p>
                  ))}
                  {paragraphs.map((text) => (
                    <p key={text} className="home-description">
                      {text}
                    </p>
                  ))}
                  <div className="home-actions">
                    {actions.map((action, actionIndex) => (
                      <button
                        key={action}
                        className={
                          actionIndex === 0
                            ? "home-cta home-cta-primary"
                            : "home-cta"
                        }
                        type="button"
                        disabled
                      >
                        {action}
                        <Icon name="arrow" />
                      </button>
                    ))}
                  </div>
                </div>
                <figure className="home-visual">
                  <Image
                    src={image}
                    alt={alt}
                    fill
                    unoptimized
                    loading={index === 0 ? "eager" : "lazy"}
                    fetchPriority={index === 0 ? "high" : undefined}
                  />
                  <figcaption className="visual-topline">
                    <span>
                      <span className="square-dot" aria-hidden="true" />
                      {caption}
                    </span>
                  </figcaption>
                </figure>
              </section>
            );
          },
        )}
      </main>
      <footer className="container home-footer">
        <strong>STREAM TALENTS</strong>
        <p>{menu.closing}</p>
      </footer>
    </div>
  );
}
