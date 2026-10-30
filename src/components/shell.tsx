import Link from "next/link";
import type { ReactNode } from "react";
import { locales, sections, sectionHref } from "@/lib/i18n/config";
import type { Locale, Section } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { Icon } from "./ui/icon";

export function Shell({
  locale,
  section,
  children,
}: {
  locale: Locale;
  section: Section;
  children: ReactNode;
}) {
  const copy = getDictionary(locale);
  return (
    <div className="shell" data-shell={section}>
      <a className="skip-link" href="#main-content">
        {copy.skipLink}
      </a>
      <header className="site-header">
        <div className="header-inner container">
          <div className="brand-lockup">
            <Link
              className="wordmark"
              href={sectionHref(locale, "public")}
              aria-label={copy.homeLabel}
            >
              GG<span className="wordmark-ending">&apos;s</span>
              <span className="wordmark-period" aria-hidden="true">
                .
              </span>
            </Link>
            <span className="brandline">{copy.brandline}</span>
          </div>
          <nav className="space-nav" aria-label={copy.navigationLabel}>
            {sections.map((item) => (
              <Link
                key={item}
                href={sectionHref(locale, item)}
                aria-current={section === item ? "page" : undefined}
              >
                {copy.sections[item].label}
              </Link>
            ))}
          </nav>
          <nav className="language-nav" aria-label={copy.languageLabel}>
            {locales.map((language) => (
              <Link
                key={language}
                href={sectionHref(language, section)}
                lang={language}
                hrefLang={language}
                aria-label={language === "es" ? "Español" : "English"}
                aria-current={locale === language ? "true" : undefined}
              >
                {language.toUpperCase()}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main id="main-content" className="container main-content" tabIndex={-1}>
        {children}
      </main>
      <footer className="site-footer container">
        <div className="footer-main">
          <span className="footer-brand">
            GG&apos;s<span aria-hidden="true">↗</span>
          </span>
          <p>{copy.footer}</p>
        </div>
        <div className="footer-bottom">
          <span>{copy.brandline}</span>
          <span>
            <Icon name="globe" />
            {copy.availability}
          </span>
        </div>
      </footer>
    </div>
  );
}
