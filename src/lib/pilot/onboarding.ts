import { z } from "zod";

// Proposed server-owned contract only. No live route consumes this evaluator.
export const onboardingRecordSchema = z
  .object({
    version: z.literal(1),
    subject: z.uuid(),
    approvedBy: z.uuid(),
    applicationId: z.uuid(),
    applicationRevision: z.number().int().positive(),
    invitationId: z.uuid(),
    approval: z.enum(["pending", "approved", "rejected"]),
    invitation: z.enum(["pending", "accepted", "expired", "revoked"]),
    membership: z.enum(["pending", "active", "suspended"]),
    role: z.literal("streamer"),
    password: z.enum(["pending", "complete"]),
    profile: z.enum(["pending", "complete"]),
  })
  .strict();
const contextSchema = z
  .object({
    ownerId: z.uuid(),
    identity: z
      .object({
        subject: z.uuid(),
        session: z.enum(["absent", "expired", "valid"]),
        emailVerified: z.boolean(),
      })
      .strict(),
    record: onboardingRecordSchema,
  })
  .strict();
export type OnboardingContext = z.infer<typeof contextSchema>;
const targets = ["password", "profile", "finalize", "streamer"] as const;
type Decision = { allowed: true } | { allowed: false; reason: string };

/** Inputs must come from fresh server identity and trusted storage, never forms/JWTs. */
export function evaluateOnboarding(target: unknown, input: unknown): Decision {
  const parsed = contextSchema.safeParse(input);
  if (!z.enum(targets).safeParse(target).success || !parsed.success)
    return { allowed: false, reason: "invalid-context" };
  const { ownerId, identity, record } = parsed.data;
  const deny = (reason: string): Decision => ({ allowed: false, reason });
  if (identity.session !== "valid" || !identity.emailVerified)
    return deny("verification-required");
  if (record.subject !== identity.subject || record.approvedBy !== ownerId)
    return deny("binding-required");
  if (record.approval !== "approved") return deny("approval-required");
  if (record.invitation !== "accepted") return deny("invitation-required");
  if (record.membership === "suspended") return deny("membership-suspended");
  if (target === "streamer")
    return record.membership === "active" &&
      record.password === "complete" &&
      record.profile === "complete"
      ? { allowed: true }
      : deny("setup-incomplete");
  if (record.membership !== "pending") return deny("setup-closed");
  if (target === "password")
    return record.password === "pending" && record.profile === "pending"
      ? { allowed: true }
      : deny("step-complete");
  if (record.password !== "complete") return deny("password-required");
  if (target === "profile")
    return record.profile === "pending"
      ? { allowed: true }
      : deny("step-complete");
  return record.profile === "complete"
    ? { allowed: true }
    : deny("profile-required");
}
