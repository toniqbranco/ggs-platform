import type { Locale } from "./config";

const copies = {
  es: {
    eyebrow: "PILOTO PRIVADO · STREAMERS",
    title: "Tu próximo paso empieza aquí.",
    description:
      "Si GG's ya habilitó tu cuenta del piloto, solicita un enlace para entrar. Ábrelo en este mismo navegador.",
    email: "Correo electrónico",
    send: "Solicitar enlace de acceso",
    offline: "El acceso del piloto no está habilitado en este entorno.",
    boundary:
      "El registro público está cerrado. Iniciar sesión no concede acceso a herramientas ni permisos de administración.",
    back: "Volver a Streamers",
    sessionTitle: "Tu acceso al piloto",
    checking: "Estamos comprobando tu sesión…",
    verified:
      "Tu sesión está verificada. Los espacios privados siguen cerrados mientras terminamos de preparar los permisos del piloto.",
    absent:
      "No hay una sesión válida. Solicita un nuevo enlace para continuar.",
    signOut: "Cerrar sesión",
    signIn: "Ir al acceso",
    states: {
      sent: "Si tu cuenta tiene acceso habilitado, recibirás un enlace. Revisa tu correo y ábrelo en este navegador. Si no llega, consulta al equipo de GG's.",
      invalid: "Introduce un correo electrónico válido.",
      expired:
        "El enlace no es válido, ya se utilizó, expiró o se abrió en otro navegador. Solicita uno nuevo.",
      unavailable:
        "No pudimos completar la solicitud. Inténtalo de nuevo más tarde.",
      "signed-out": "Se cerró la sesión de este navegador.",
    },
  },
  en: {
    eyebrow: "PRIVATE PILOT · STREAMERS",
    title: "Your next step starts here.",
    description:
      "If GG's has already enabled your pilot account, request a sign-in link. Open it in this same browser.",
    email: "Email address",
    send: "Request sign-in link",
    offline: "Pilot sign-in is not enabled in this environment.",
    boundary:
      "Public registration is closed. Signing in does not grant access to tools or admin permissions.",
    back: "Back to Streamers",
    sessionTitle: "Your pilot access",
    checking: "Checking your session…",
    verified:
      "Your session is verified. Private workspaces remain closed while we finish preparing pilot permissions.",
    absent:
      "There is no valid session. Request a new sign-in link to continue.",
    signOut: "Sign out",
    signIn: "Go to sign-in",
    states: {
      sent: "If your account has access enabled, you will receive a link. Check your email and open it in this browser. If it does not arrive, contact the GG's team.",
      invalid: "Enter a valid email address.",
      expired:
        "The link is invalid, already used, expired, or was opened in another browser. Request a new one.",
      unavailable: "We could not complete the request. Please try again later.",
      "signed-out": "You have signed out of this browser.",
    },
  },
};
export function getAuthCopy(locale: Locale) {
  return copies[locale];
}
