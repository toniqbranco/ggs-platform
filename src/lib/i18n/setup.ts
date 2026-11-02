import type { Locale } from "./config";

const copy = {
  es: {
    eyebrow: "TU PRÓXIMO CAPÍTULO · GG’S",
    title: "Tu talento.\nTu espacio.",
    intro:
      "Un comienzo sencillo para una nueva etapa. Así será la configuración de tu acceso como streamer aprobado.",
    preview: "Vista previa · Datos ficticios",
    notice:
      "Esta es una demostración. No introduzcas datos reales: las contraseñas y los perfiles aún no se guardan. No se crea ninguna cuenta ni se activa el acceso.",
    steps: ["Contraseña", "Perfil privado"],
    passwordTitle: "Crea tu contraseña",
    passwordIntro:
      "Una contraseña para volver a tu espacio, sin pedir un enlace en cada visita.",
    password: "Contraseña",
    confirm: "Confirmar contraseña",
    passwordHint:
      "La configuración final permitirá usar tu gestor de contraseñas. En esta vista previa no puedes introducir una contraseña.",
    profileTitle: "Tu perfil de streamer",
    profileIntro:
      "Solo lo esencial para conocerte. Este perfil será privado; no se publicará en la web.",
    name: "Nombre de creador",
    email: "Correo verificado",
    country: "País",
    language: "Idioma preferido",
    platform: "Plataforma principal",
    url: "Enlace a tu perfil de creador",
    next: "Ver paso del perfil",
    back: "Volver al paso de contraseña",
    save: "Guardar perfil · Aún no disponible",
    signIn: "Ir a iniciar sesión",
    promise: "La aprobación viene primero.",
    detail:
      "Solo las personas aprobadas e invitadas podrán configurar su acceso. Completar el perfil no concede permisos de administración.",
    ending:
      "Después de la configuración, el acceso se comprobará de nuevo. Las herramientas del piloto se abrirán en una etapa posterior.",
    navigation: "Pasos de configuración",
  },
  en: {
    eyebrow: "YOUR NEXT CHAPTER · GG’S",
    title: "Your talent.\nYour space.",
    intro:
      "A simple start to a new chapter. A preview of first-time setup for approved streamers.",
    preview: "Preview · Fictional details",
    notice:
      "This is a demonstration. Do not enter real details: passwords and profiles cannot be saved yet. No account is created and no access is activated.",
    steps: ["Password", "Private profile"],
    passwordTitle: "Create your password",
    passwordIntro:
      "One password to return to your space, without requesting a link on every visit.",
    password: "Password",
    confirm: "Confirm password",
    passwordHint:
      "The final setup will support your password manager. You cannot enter a password in this preview.",
    profileTitle: "Your streamer profile",
    profileIntro:
      "Just the essentials to get to know you. This profile will be private; it will not be published on the website.",
    name: "Creator name",
    email: "Verified email",
    country: "Country",
    language: "Preferred language",
    platform: "Primary platform",
    url: "Creator profile link",
    next: "Preview profile step",
    back: "Back to password step",
    save: "Save profile · Not available yet",
    signIn: "Go to sign-in",
    promise: "Approval comes first.",
    detail:
      "Only approved, invited people will be able to set up their access. Completing a profile does not grant admin permissions.",
    ending:
      "After setup, access will be checked again. Pilot tools will open in a later stage.",
    navigation: "Setup steps",
  },
} satisfies Record<Locale, unknown>;
export const getSetupCopy = (locale: Locale) => copy[locale];
export type SetupStep = "password" | "profile";
export function readSetupStep(value: unknown): SetupStep {
  return value === "profile" ? "profile" : "password";
}
