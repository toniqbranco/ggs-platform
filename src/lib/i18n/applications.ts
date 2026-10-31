import type { Locale } from "./config";

const copy = {
  en: {
    eyebrow: "THE NEXT WAVE · GG'S TALENT",
    title: "Your next chapter starts here.",
    description:
      "A space for creators with a voice, a vision, and the drive to grow. Let’s get to know your talent.",
    preview: "Interactive preview",
    notice:
      "Applications are not open yet. Try this form with fictional details. Nothing is sent or saved.",
    formTitle: "Make your introduction",
    formDescription: "Five details. One first connection.",
    fields: {
      name: "Creator name",
      email: "Email address",
      country: "Country",
      platform: "Primary platform",
      profile: "Profile URL",
    },
    other: "Other",
    profileHelp: "Use a complete HTTPS link. Never enter a password.",
    button: "Check preview",
    invalid:
      "Check the highlighted fields. Use a valid email and an HTTPS profile URL without login details.",
    checked:
      "Preview checked. Your application has not been submitted, saved, or approved.",
    steps: [
      ["Introduce yourself", "Share your creator profile."],
      ["A human review", "Every application gets an individual decision."],
      [
        "An invitation to begin",
        "Approved creators receive a separate invitation before private access.",
      ],
    ],
    path: "THE PATH AHEAD",
    signIn: "Already invited? Sign in",
    back: "Back to the public website",
    reviewTitle: "Talent, meet opportunity.",
    reviewIntro: "A considered decision for every creator.",
    reviewEyebrow: "PRIVATE HQ · OWNER REVIEW",
    reviewNotice:
      "Fictional applications only. Decisions are rehearsals in this tab; reload to reset. No accounts, approvals, or invitations are changed.",
    listTitle: "Application queue",
    detailTitle: "Creator overview",
    select: "Review",
    pending: "Pending",
    approved: "Approved",
    rejected: "Rejected",
    all: "All applications",
    approve: "Rehearse approval",
    reject: "Rehearse rejection",
    confirmTitle: "Confirm this rehearsal",
    confirmApprove:
      "Mark this fictional application as approved? No invitation or access will be granted.",
    confirmReject:
      "Mark this fictional application as rejected? No message will be sent.",
    confirm: "Confirm rehearsal",
    cancel: "Cancel",
    reset: "Reset preview",
    done: "Rehearsal complete. No real access or invitation changed.",
    next: "Invitation is a separate step. Sending remains unavailable in this preview.",
    checking: "Checking private access…",
    denied:
      "Private review is unavailable. Sign in with an approved owner account.",
    signOut: "Sign out",
    invitation: "Invitation not sent",
    sample: "FICTIONAL RECORD",
    noResults: "No applications in this view.",
  },
  es: {
    eyebrow: "LA NUEVA OLA · TALENTO GG'S",
    title: "Tu próximo capítulo empieza aquí.",
    description:
      "Un espacio para creadores con voz, visión y ganas de crecer. Queremos conocer tu talento.",
    preview: "Vista previa interactiva",
    notice:
      "Las solicitudes aún no están abiertas. Prueba el formulario con datos ficticios. Nada se envía ni se guarda.",
    formTitle: "Cuéntanos quién eres",
    formDescription: "Cinco datos. Una primera conexión.",
    fields: {
      name: "Nombre de creador",
      email: "Correo electrónico",
      country: "País",
      platform: "Plataforma principal",
      profile: "URL del perfil",
    },
    other: "Otra",
    profileHelp: "Usa un enlace HTTPS completo. Nunca escribas una contraseña.",
    button: "Comprobar vista previa",
    invalid:
      "Revisa los campos indicados. Usa un correo válido y una URL HTTPS de perfil sin credenciales.",
    checked:
      "Vista previa comprobada. Tu solicitud no se ha enviado, guardado ni aprobado.",
    steps: [
      ["Preséntate", "Comparte tu perfil de creador."],
      ["Una revisión humana", "Cada solicitud recibe una decisión individual."],
      [
        "Una invitación para empezar",
        "Los creadores aprobados reciben una invitación independiente antes del acceso privado.",
      ],
    ],
    path: "EL CAMINO POR DELANTE",
    signIn: "¿Ya tienes invitación? Inicia sesión",
    back: "Volver al sitio público",
    reviewTitle: "Talento y oportunidades.",
    reviewIntro: "Una decisión consciente para cada creador.",
    reviewEyebrow: "HQ PRIVADO · REVISIÓN DEL PROPIETARIO",
    reviewNotice:
      "Solo solicitudes ficticias. Las decisiones son ensayos en esta pestaña; recarga para reiniciar. No se modifican cuentas, aprobaciones ni invitaciones.",
    listTitle: "Solicitudes",
    detailTitle: "Perfil del creador",
    select: "Revisar",
    pending: "Pendiente",
    approved: "Aprobada",
    rejected: "Rechazada",
    all: "Todas las solicitudes",
    approve: "Ensayar aprobación",
    reject: "Ensayar rechazo",
    confirmTitle: "Confirma este ensayo",
    confirmApprove:
      "¿Marcar esta solicitud ficticia como aprobada? No se enviará una invitación ni se concederá acceso.",
    confirmReject:
      "¿Marcar esta solicitud ficticia como rechazada? No se enviará ningún mensaje.",
    confirm: "Confirmar ensayo",
    cancel: "Cancelar",
    reset: "Reiniciar vista previa",
    done: "Ensayo completado. No se modificó ningún acceso ni invitación real.",
    next: "La invitación es un paso independiente. El envío sigue sin estar disponible en esta vista previa.",
    checking: "Comprobando acceso privado…",
    denied:
      "La revisión privada no está disponible. Inicia sesión con una cuenta de propietario aprobada.",
    signOut: "Cerrar sesión",
    invitation: "Invitación no enviada",
    sample: "REGISTRO FICTICIO",
    noResults: "No hay solicitudes en esta vista.",
  },
};
export function getApplicationCopy(locale: Locale) {
  return copy[locale];
}
