import { z } from "zod";

export const pilotRoles = ["owner", "admin", "streamer"] as const;
export const pilotTargets = ["hq", "streamer", "pilot-management"] as const;
export type PilotRole = (typeof pilotRoles)[number];
export type PilotTarget = (typeof pilotTargets)[number];

const contextSchema = z
  .object({
    session: z.enum(["absent", "expired", "valid"]),
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

export type PilotPolicyContext = z.infer<typeof contextSchema>;
export type PilotDenyReason =
  | "invalid-context"
  | "sign-in-required"
  | "session-expired"
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
 * Disconnected policy contract, not a session verifier or live authorization gate.
 * Future enforcement must build context from trusted server-side identity/records.
 * No route reads browser roles, cookies, query parameters, or test fixtures here.
 */
export function evaluatePilotPolicy(
  target: unknown,
  input: unknown,
): PilotDecision {
  const targetResult = z.enum(pilotTargets).safeParse(target);
  const context = contextSchema.safeParse(input);
  if (!targetResult.success || !context.success)
    return { allowed: false, reason: "invalid-context" };

  const { session, invitation, membership, roles } = context.data;
  if (session === "absent")
    return { allowed: false, reason: "sign-in-required" };
  if (session === "expired")
    return { allowed: false, reason: "session-expired" };
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
