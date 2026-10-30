import type { Locale } from "./config";

type PilotCopy = {
  eyebrow: string;
  preview: string;
  invitationOnly: string;
  entryTitle: string;
  entryDescription: string;
  availability: string;
  signinSoon: string;
  readPolicy: string;
  backHome: string;
  stepsLabel: string;
  steps: { title: string; description: string }[];
  trustLabel: string;
  trustDescription: string;
  information: { title: string; description: string; note: string };
  denied: { title: string; description: string; note: string };
  audienceLabel: string;
  audience: { name: string; description: string }[];
  withoutInvitation: string;
};

const copies: Record<Locale, PilotCopy> = {
  es: {
    eyebrow: "PILOTO PRIVADO DE GG'S",
    preview: "Vista previa del piloto",
    invitationOnly: "Solo por invitación",
    entryTitle: "Tu invitación es el primer paso.",
    entryDescription:
      "Estamos preparando un piloto privado para los streamers de GG's. El acceso se habilitará únicamente para participantes invitados y aprobados.",
    availability:
      "El inicio de sesión todavía no está disponible. Esta página no crea cuentas ni solicita tus datos.",
    signinSoon: "Inicio de sesión próximamente",
    readPolicy: "Cómo funcionará el acceso",
    backHome: "Volver al inicio",
    stepsLabel: "El acceso, paso a paso",
    steps: [
      {
        title: "Invitación directa",
        description:
          "GG's invitará a los participantes del piloto. El registro público permanecerá cerrado.",
      },
      {
        title: "Acceso aprobado",
        description:
          "El equipo confirmará el espacio y los permisos correspondientes a cada participante.",
      },
      {
        title: "Entrada al piloto",
        description:
          "Cuando el acceso esté habilitado, cada persona podrá entrar únicamente a su espacio aprobado.",
      },
    ],
    trustLabel: "La confianza es nuestra base.",
    trustDescription:
      "Un grupo cuidado. Permisos claros. Un comienzo con propósito.",
    information: {
      title: "Un buen comienzo, por invitación.",
      description:
        "El piloto de GG's comenzará con un grupo de participantes invitados. Así podremos cuidar la experiencia desde el primer día.",
      note: "Las invitaciones y el inicio de sesión aún no están habilitados. Esta vista previa explica la política del piloto; no es un formulario de registro.",
    },
    denied: {
      title: "Este espacio requiere una invitación.",
      description:
        "El acceso al piloto estará reservado a participantes invitados y aprobados para cada espacio.",
      note: "El inicio de sesión aún no está habilitado. Este mensaje muestra la política de acceso; no indica el estado de una cuenta personal.",
    },
    audienceLabel: "Cada espacio tiene su propósito",
    audience: [
      {
        name: "Streamers",
        description: "Un espacio para cada streamer aprobado en el piloto.",
      },
      {
        name: "Comunidad",
        description:
          "El sitio público seguirá disponible para conocer la visión de GG's.",
      },
    ],
    withoutInvitation: "¿No tienes invitación?",
  },
  en: {
    eyebrow: "GG'S PRIVATE PILOT",
    preview: "Pilot preview",
    invitationOnly: "Invitation only",
    entryTitle: "Your invitation comes first.",
    entryDescription:
      "We're preparing a private pilot for GG's streamers. Access will open only to invited and approved participants.",
    availability:
      "Sign-in is not available yet. This page does not create accounts or collect your details.",
    signinSoon: "Sign-in coming soon",
    readPolicy: "How access will work",
    backHome: "Back to home",
    stepsLabel: "Access, step by step",
    steps: [
      {
        title: "A direct invitation",
        description:
          "GG's will invite pilot participants. Public registration will remain closed.",
      },
      {
        title: "Approved access",
        description:
          "The team will confirm the appropriate space and permissions for each participant.",
      },
      {
        title: "Your pilot space",
        description:
          "Once access opens, each person will enter only their approved space.",
      },
    ],
    trustLabel: "Built on trust.",
    trustDescription:
      "A considered group. Clear permissions. A purposeful beginning.",
    information: {
      title: "Good beginnings start with an invitation.",
      description:
        "The GG's pilot will begin with a group of invited participants, so we can care for the experience from day one.",
      note: "Invitations and sign-in are not enabled yet. This preview explains the pilot policy; it is not a registration form.",
    },
    denied: {
      title: "An invitation is required for this space.",
      description:
        "Pilot access will be reserved for participants invited and approved for each space.",
      note: "Sign-in is not enabled yet. This message presents the access policy; it does not reflect the status of a personal account.",
    },
    audienceLabel: "Every space has a purpose",
    audience: [
      {
        name: "Streamers",
        description: "A space for each streamer approved for the pilot.",
      },
      {
        name: "Community",
        description: "The public site stays open to discover the GG's vision.",
      },
    ],
    withoutInvitation: "No invitation yet?",
  },
};

export function getPilotCopy(locale: Locale): PilotCopy {
  return copies[locale];
}
