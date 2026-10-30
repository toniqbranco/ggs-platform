import Image from "next/image";
import type { Locale, Section } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { Icon } from "./ui/icon";

export function HeroVisual({
  locale,
  section,
}: {
  locale: Locale;
  section: Section;
}) {
  const copy = getDictionary(locale);
  return (
    <div className={`hero-visual hero-visual-${section}`}>
      {section === "public" ? (
        <Image
          src="/images/creator-editorial.webp"
          alt={copy.mediaAlt}
          fill
          sizes="(max-width: 760px) 100vw, 50vw"
          preload
          className="creator-photo"
        />
      ) : (
        <div className="workspace-art" aria-hidden="true">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="orbit orbit-three" />
          <span className="art-wordmark">
            GG&apos;s<span>↗</span>
          </span>
          <div className="art-node node-one" />
          <div className="art-node node-two" />
        </div>
      )}
      <div className="visual-topline">
        <span>
          <span className="square-dot" />
          {section === "public"
            ? copy.mediaLabel
            : copy.sections[section].label}
        </span>
        <Icon name="spark" />
      </div>
      <div className="visual-caption">
        <span className="visual-rule" />
        <p>{copy.mediaTitle}</p>
        <Icon name="signal" />
      </div>
      <span className="visual-index" aria-hidden="true">
        GG&apos;S — 001
      </span>
    </div>
  );
}
