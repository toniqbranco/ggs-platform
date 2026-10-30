import { z } from "zod";

export const pilotRoles = ["owner", "admin", "streamer"] as const;
export const pilotTargets = ["hq", "streamer", "pilot-management"] as const;
export type PilotRole = (typeof pilotRoles)[number];
export type PilotTarget = (typeof pilotTargets)[number];

export const pilotContextSchema = z
  .object({
    session: z.enum(["absent", "expired", "valid"]),
    approval: z.enum(["pending", "approved", "rejected"]),
    invitation: z.enum([
      "not-invited",
      "pending",
      "accepted",
      "expired",
      "revoked",
    ]),
    membership: z.enum(["pending", "active", "suspended"]),
    roles: z.array(z.enum(pilotRoles)).max(pilotRoles.length),
  })
  .strict();

export type PilotPolicyContext = z.infer<typeof pilotContextSchema>;
export type PilotDenyReason =
  | "invalid-context"
  | "sign-in-required"
  | "session-expired"
  | "approval-required"
  | "invitation-required"
  | "invitation-inactive"
  | "membership-pending"
  | "membership-suspended"
  | "role-denied";
export type PilotDecision =
  { allowed: true } | { allowed: false; reason: PilotDenyReason };

const targetRoles: Record<PilotTarget, readonly PilotRole[]> = {
  hq: ["owner", "admin"],
  streamer: ["streamer"],
  "pilot-management": ["owner"],
};

/**
 * Pure access decision. The server adapter binds verified identity to the latest
 * owner-approved admission record. This function never verifies a session itself.
 */
export function evaluatePilotPolicy(
  target: unknown,
  input: unknown,
): PilotDecision {
  const targetResult = z.enum(pilotTargets).safeParse(target);
  const context = pilotContextSchema.safeParse(input);
  if (!targetResult.success || !context.success)
    return { allowed: false, reason: "invalid-context" };

  const { session, approval, invitation, membership, roles } = context.data;
  if (session === "absent")
    return { allowed: false, reason: "sign-in-required" };
  if (session === "expired")
    return { allowed: false, reason: "session-expired" };
  if (approval !== "approved")
    return { allowed: false, reason: "approval-required" };
  if (membership === "suspended")
    return { allowed: false, reason: "membership-suspended" };
  if (invitation === "expired" || invitation === "revoked")
    return { allowed: false, reason: "invitation-inactive" };
  if (invitation !== "accepted")
    return { allowed: false, reason: "invitation-required" };
  if (membership !== "active")
    return { allowed: false, reason: "membership-pending" };
  if (!roles.some((role) => targetRoles[targetResult.data].includes(role)))
    return { allowed: false, reason: "role-denied" };
  return { allowed: true };
}
