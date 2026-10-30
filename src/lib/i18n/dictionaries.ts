import type { Locale, Section } from "./config";

type SectionCopy = {
  label: string;
  eyebrow: string;
  title: string;
  accent: string;
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
  brandline: string;
  availability: string;
  footer: string;
  backHome: string;
  discover: string;
  spacesLabel: string;
  mediaLabel: string;
  mediaTitle: string;
  mediaAlt: string;
  perspective: string;
  visionTitle: string;
  visionDescription: string;
  visionNote: string;
  pillars: string[];
  principles: { title: string; description: string }[];
  sections: Record<Section, SectionCopy>;
};

const spanish: Dictionary = {
  metadata: {
    title: "GG's · Talento sin fronteras",
    description:
      "Una nueva perspectiva para el talento digital, la cultura del directo y la conexión global.",
  },
  skipLink: "Saltar al contenido",
  navigationLabel: "Espacios de GG's",
  languageLabel: "Idioma",
  homeLabel: "GG's — Inicio",
  brandline: "Talento. Cultura. Conexión.",
  availability: "En preparación",
  footer: "Lo que viene, lo creamos juntos.",
  backHome: "Volver al inicio",
  discover: "Conoce GG's",
  spacesLabel: "Nuestros espacios",
  mediaLabel: "Cultura creadora",
  mediaTitle: "Más voces. Más posibilidades.",
  mediaAlt:
    "Retrato editorial de una creadora con auriculares y micrófono en un estudio; imagen conceptual generada con IA.",
  perspective: "Nuestra perspectiva",
  visionTitle: "El futuro se crea en compañía.",
  visionDescription:
    "La creatividad se mueve. Las comunidades crecen. Nuestra mirada está en lo que sucede cuando el talento, la tecnología y las personas se encuentran.",
  visionNote: "Una nueva perspectiva. Una base sólida.",
  pillars: ["Talento digital", "Cultura del directo", "Visión global"],
  principles: [
    {
      title: "El talento, primero.",
      description:
        "Personas con una voz propia. Ideas con espacio para crecer.",
    },
    {
      title: "Conexiones con sentido.",
      description:
        "Una mirada compartida entre creatividad, cultura y tecnología.",
    },
    {
      title: "Sin fronteras por definición.",
      description: "Mentalidad global. Atención a lo que nos hace únicos.",
    },
  ],
  sections: {
    public: {
      label: "Inicio",
      eyebrow: "UNA NUEVA PERSPECTIVA PARA EL TALENTO DIGITAL",
      title: "Talento sin",
      accent: "fronteras.",
      description:
        "Donde el talento digital, la cultura del directo y las nuevas ideas encuentran su próximo horizonte.",
      panelTitle: "Estamos dando forma a lo que viene.",
      panelDescription:
        "Los espacios de GG's están en preparación. Por ahora, descubre la base de nuestra próxima etapa.",
    },
    hq: {
      label: "HQ",
      eyebrow: "EL ESPACIO DEL EQUIPO",
      title: "La conexión",
      accent: "empieza aquí.",
      description:
        "Una perspectiva compartida. Un lugar para dar forma al próximo capítulo de GG's.",
      panelTitle: "Una buena base para grandes ideas.",
      panelDescription:
        "El espacio del equipo está en preparación. Esta vista previa presenta la estructura; todavía no hay herramientas ni datos del equipo disponibles.",
    },
    streamer: {
      label: "Streamers",
      eyebrow: "EL ESPACIO STREAMER",
      title: "Tu voz.",
      accent: "Tu horizonte.",
      description:
        "La creatividad empieza contigo. Este es el inicio de tu espacio en GG's.",
      panelTitle: "Tu próxima etapa está tomando forma.",
      panelDescription:
        "El espacio streamer está en preparación. Esta vista previa presenta la estructura; todavía no hay herramientas ni datos de streamers disponibles.",
    },
  },
};

const english: Dictionary = {
  metadata: {
    title: "GG's · Talent without limits",
    description:
      "A fresh perspective on digital talent, live culture, and global connection.",
  },
  skipLink: "Skip to content",
  navigationLabel: "GG's spaces",
  languageLabel: "Language",
  homeLabel: "GG's — Home",
  brandline: "Talent. Culture. Connection.",
  availability: "In preparation",
  footer: "What's next is a collective thing.",
  backHome: "Back to home",
  discover: "Discover GG's",
  spacesLabel: "Our spaces",
  mediaLabel: "Creator culture",
  mediaTitle: "More voices. More possibilities.",
  mediaAlt:
    "Editorial portrait of a creator wearing headphones beside a studio microphone; AI-generated conceptual image.",
  perspective: "Our perspective",
  visionTitle: "The future is a collective thing.",
  visionDescription:
    "Creativity moves. Communities grow. We're looking at what happens when talent, technology, and people come together.",
  visionNote: "Fresh perspective. Solid foundation.",
  pillars: ["Digital talent", "Live culture", "Global mindset"],
  principles: [
    {
      title: "Talent comes first.",
      description: "People with a voice of their own. Ideas with room to grow.",
    },
    {
      title: "Connection with purpose.",
      description:
        "A shared perspective across creativity, culture, and technology.",
    },
    {
      title: "Borderless by nature.",
      description: "A global mindset. An eye for what makes us unique.",
    },
  ],
  sections: {
    public: {
      label: "Home",
      eyebrow: "A FRESH PERSPECTIVE ON DIGITAL TALENT",
      title: "Talent without",
      accent: "limits.",
      description:
        "Where digital talent, live culture, and new ideas find their next horizon.",
      panelTitle: "We're shaping what comes next.",
      panelDescription:
        "The GG's spaces are in preparation. For now, explore the foundation of our next chapter.",
    },
    hq: {
      label: "HQ",
      eyebrow: "THE TEAM SPACE",
      title: "Connection",
      accent: "starts here.",
      description:
        "A shared perspective. A place to shape the next chapter of GG's.",
      panelTitle: "A solid foundation for big ideas.",
      panelDescription:
        "The team space is in preparation. This preview presents the structure; team tools and data are not available yet.",
    },
    streamer: {
      label: "Streamers",
      eyebrow: "THE STREAMER SPACE",
      title: "Your voice.",
      accent: "Your horizon.",
      description:
        "Creativity starts with you. This is the beginning of your space at GG's.",
      panelTitle: "Your next chapter is taking shape.",
      panelDescription:
        "The streamer space is in preparation. This preview presents the structure; streamer tools and data are not available yet.",
    },
  },
};

const dictionaries: Record<Locale, Dictionary> = { es: spanish, en: english };
export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale];
}
