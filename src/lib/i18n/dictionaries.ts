import type { Locale, Section } from "./config";

type SectionCopy = {
  label: string;
  eyebrow: string;
  title: string;
  description: string;
  panelTitle: string;
  panelDescription: string;
};

type Dictionary = {
  metadata: { title: string; description: string };
  skipLink: string;
  navigationLabel: string;
  languageLabel: string;
  homeLabel: string;
  availability: string;
  footer: string;
  backHome: string;
  sections: Record<Section, SectionCopy>;
};

const spanish: Dictionary = {
  metadata: {
    title: "GG's · Un espacio para lo que viene",
    description: "Los espacios de GG's están en preparación.",
  },
  skipLink: "Saltar al contenido",
  navigationLabel: "Espacios de GG's",
  languageLabel: "Idioma",
  homeLabel: "GG's — Inicio",
  availability: "En preparación",
  footer: "Vamos paso a paso. Esto apenas comienza.",
  backHome: "Volver al inicio",
  sections: {
    public: {
      label: "Inicio",
      eyebrow: "ESTO ES GG'S",
      title: "Un espacio para lo que viene.",
      description:
        "Estamos preparando nuestra próxima etapa. Pronto habrá más por descubrir.",
      panelTitle: "Todo empieza con una buena base.",
      panelDescription:
        "Estamos dando forma a los espacios de GG's. Las novedades llegarán aquí cuando estén listas.",
    },
    hq: {
      label: "HQ",
      eyebrow: "ESPACIO DEL EQUIPO",
      title: "Un lugar para construir juntos.",
      description: "La base del espacio de trabajo de GG's.",
      panelTitle: "El espacio del equipo está en preparación.",
      panelDescription:
        "Esta es una vista previa de la estructura. Todavía no hay herramientas ni datos del equipo disponibles.",
    },
    streamer: {
      label: "Streamers",
      eyebrow: "ESPACIO STREAMER",
      title: "Tu espacio para lo que sigue.",
      description: "La base del espacio para streamers de GG's.",
      panelTitle: "Tu espacio está en preparación.",
      panelDescription:
        "Esta es una vista previa de la estructura. Todavía no hay herramientas ni datos de streamers disponibles.",
    },
  },
};

const english: Dictionary = {
  metadata: {
    title: "GG's · A space for what's next",
    description: "The GG's spaces are in preparation.",
  },
  skipLink: "Skip to content",
  navigationLabel: "GG's spaces",
  languageLabel: "Language",
  homeLabel: "GG's — Home",
  availability: "In preparation",
  footer: "One step at a time. This is just the beginning.",
  backHome: "Back to home",
  sections: {
    public: {
      label: "Home",
      eyebrow: "THIS IS GG'S",
      title: "A space for what's next.",
      description:
        "We're preparing our next chapter. Soon there will be more to discover.",
      panelTitle: "It starts with a solid foundation.",
      panelDescription:
        "We're shaping the GG's spaces. Updates will appear here when they're ready.",
    },
    hq: {
      label: "HQ",
      eyebrow: "TEAM SPACE",
      title: "A place to build together.",
      description: "The foundation of the GG's team workspace.",
      panelTitle: "The team space is in preparation.",
      panelDescription:
        "This is a preview of the structure. Team tools and data are not available yet.",
    },
    streamer: {
      label: "Streamers",
      eyebrow: "STREAMER SPACE",
      title: "Your space for what's next.",
      description: "The foundation of the GG's streamer space.",
      panelTitle: "Your space is in preparation.",
      panelDescription:
        "This is a preview of the structure. Streamer tools and data are not available yet.",
    },
  },
};

const dictionaries: Record<Locale, Dictionary> = { es: spanish, en: english };

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale];
}
