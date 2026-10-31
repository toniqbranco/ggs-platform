import type { Locale } from "./config";

const copies = {
  es: {
    eyebrow: "PILOTO PRIVADO · STREAMERS",
    title: "Tu próximo paso empieza aquí.",
    description:
      "Si GG's ya habilitó tu cuenta del piloto, solicita un enlace para entrar. Ábrelo en este mismo navegador.",
    closedDescription:
      "Un espacio privado para streamers aprobados por GG's. El acceso se abrirá por invitación.",
    email: "Correo electrónico",
    send: "Solicitar enlace de acceso",
    offline: "El acceso del piloto aún no está disponible.",
    boundary:
      "El registro público está cerrado. Iniciar sesión no concede acceso a herramientas ni permisos de administración.",
    back: "Volver a Streamers",
    sessionTitle: "Tu acceso al piloto",
    checking: "Estamos comprobando tu sesión…",
    verified:
      "Tu identidad y tu acceso aprobado están verificados. Las herramientas del piloto se habilitarán en una próxima etapa.",
    absent:
      "No hay una sesión válida. Solicita un nuevo enlace para continuar.",
    restricted:
      "Tu cuenta no tiene acceso aprobado y activo al piloto. Consulta al equipo de GG's. Un enlace de correo no sustituye la aprobación.",
    signOut: "Cerrar sesión",
    signIn: "Ir al acceso",
    states: {
      "browser-required":
        "El enlace se abrió sin la verificación del navegador donde lo solicitaste. Abre el sitio en el navegador que prefieras, solicita un enlace nuevo y ábrelo en ese mismo navegador.",
      "approval-required":
        "Tu acceso al piloto requiere aprobación y una invitación aceptada. Consulta al equipo de GG's.",
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
    closedDescription:
      "A private space for streamers approved by GG's. Access will open by invitation.",
    email: "Email address",
    send: "Request sign-in link",
    offline: "Pilot sign-in is not open yet.",
    boundary:
      "Public registration is closed. Signing in does not grant access to tools or admin permissions.",
    back: "Back to Streamers",
    sessionTitle: "Your pilot access",
    checking: "Checking your session…",
    verified:
      "Your identity and approved access are verified. Pilot tools will open in a later stage.",
    absent:
      "There is no valid session. Request a new sign-in link to continue.",
    restricted:
      "Your account does not have approved, active pilot access. Contact the GG's team. An email link does not replace approval.",
    signOut: "Sign out",
    signIn: "Go to sign-in",
    states: {
      "browser-required":
        "The link opened without the verification from the browser that requested it. Open the site in your preferred browser, request a new link, and open it in that same browser.",
      "approval-required":
        "Pilot access requires approval and an accepted invitation. Contact the GG's team.",
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
