import { z } from "zod";
import {
  evaluatePilotPolicy,
  pilotContextSchema,
  type PilotPolicyContext,
  type PilotTarget,
} from "./policy";

export type VerifiedPilotUser = {
  id: string;
  email_confirmed_at?: string | undefined;
  is_anonymous?: boolean;
  app_metadata?: Record<string, unknown>;
};

const recordSchema = pilotContextSchema
  .omit({ session: true })
  .extend({
    version: z.literal(1),
    subject: z.uuid(),
    approved_by: z.uuid(),
    approved_at: z.iso.datetime(),
  })
  .strict();

/** Only call with the fresh user returned by the server's getUser(), never JWT claims. */
export function readPilotAdmission(
  user: VerifiedPilotUser,
  ownerUserId: string | undefined,
  now = Date.now(),
): PilotPolicyContext | null {
  if (
    !ownerUserId ||
    !z.uuid().safeParse(ownerUserId).success ||
    user.is_anonymous ||
    !user.email_confirmed_at
  )
    return null;
  const record = recordSchema.safeParse(user.app_metadata?.ggs_pilot);
  if (!record.success) return null;
  const value = record.data;
  if (
    value.subject !== user.id ||
    value.approved_by !== ownerUserId ||
    Date.parse(value.approved_at) > now ||
    (value.roles.includes("owner") && user.id !== ownerUserId)
  )
    return null;
  return {
    session: "valid",
    approval: value.approval,
    invitation: value.invitation,
    membership: value.membership,
    roles: value.roles,
  };
}

export function hasPilotAdmission(context: PilotPolicyContext | null) {
  return (
    context !== null &&
    (["hq", "streamer"] as PilotTarget[]).some(
      (target) => evaluatePilotPolicy(target, context).allowed,
    )
  );
}
