import type { Locale } from "./config";
const copy = {
  es: {
    title: "Solicitudes y seguimiento",
    eyebrow: "HQ PRIVADO · PROPIETARIO",
    mode: "Solo lectura",
    notice:
      "Revisión de pruebas. Consulta las solicitudes guardadas y su historial. Las solicitudes públicas siguen cerradas; no se conceden accesos ni se envían invitaciones desde aquí.",
    queue: "Solicitudes guardadas",
    detail: "Perfil e historial",
    history: "Historial",
    refresh: "Actualizar solicitudes",
    checking: "Comprobando acceso y solicitudes…",
    unavailable:
      "La revisión privada no está disponible. Comprueba tu sesión y vuelve a intentarlo.",
    signIn: "Iniciar sesión",
    signOut: "Cerrar sesión",
    empty: "No hay solicitudes guardadas.",
    select: "Selecciona una solicitud para ver su historial.",
    limit:
      "Se muestran hasta 50 solicitudes, de la más antigua a la más reciente.",
    name: "Nombre",
    email: "Correo",
    country: "País",
    platform: "Plataforma",
    profile: "Perfil",
    revision: "Versión",
    pending: "Pendiente",
    approved: "Aprobada",
    rejected: "Rechazada",
    withdrawn: "Retirada",
    submitted: "Enviada",
    historyLoading: "Cargando historial…",
  },
  en: {
    title: "Applications and progress",
    eyebrow: "PRIVATE HQ · OWNER",
    mode: "Read only",
    notice:
      "Testing review. View saved applications and their history. Public applications remain closed; access and invitations are not granted here.",
    queue: "Saved applications",
    detail: "Profile and history",
    history: "History",
    refresh: "Refresh applications",
    checking: "Checking access and applications…",
    unavailable:
      "Private review is unavailable. Check your session and try again.",
    signIn: "Sign in",
    signOut: "Sign out",
    empty: "No saved applications.",
    select: "Select an application to view its history.",
    limit: "Showing up to 50 applications, from oldest to newest.",
    name: "Name",
    email: "Email",
    country: "Country",
    platform: "Platform",
    profile: "Profile",
    revision: "Revision",
    pending: "Pending",
    approved: "Approved",
    rejected: "Rejected",
    withdrawn: "Withdrawn",
    submitted: "Submitted",
    historyLoading: "Loading history…",
  },
};
export function getStoredReviewCopy(locale: Locale) {
  return copy[locale];
}
