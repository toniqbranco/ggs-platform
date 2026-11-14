"use client";

import { useEffect, useRef } from "react";

const storageKey = "stream-talents-home-theme";

export function HomeThemeToggle({ label }: { label: string }) {
  const button = useRef<HTMLButtonElement>(null);

  function applyTheme(light: boolean) {
    const toggle = button.current;
    const home = toggle?.closest<HTMLElement>(".stream-home");
    if (!toggle || !home) return;
    home.dataset.theme = light ? "light" : "dark";
    toggle.setAttribute("aria-pressed", String(light));
    toggle.hidden = false;
  }

  useEffect(() => {
    let light = false;
    try {
      light = localStorage.getItem(storageKey) === "light";
    } catch {
      // The toggle can still change the current page.
    }
    applyTheme(light);
  }, []);

  function toggleTheme() {
    const light = button.current?.getAttribute("aria-pressed") !== "true";
    applyTheme(light);
    try {
      localStorage.setItem(storageKey, light ? "light" : "dark");
    } catch {
      // The current page already reflects the choice.
    }
  }

  return (
    <button
      ref={button}
      className="home-theme-toggle"
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={false}
      onClick={toggleTheme}
      hidden
    >
      <svg
        viewBox="0 0 24 24"
        width="19"
        height="19"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.4 1.4m11.2 11.2L19 19M5 19l1.4-1.4M17.6 6.4 19 5" />
      </svg>
    </button>
  );
}
