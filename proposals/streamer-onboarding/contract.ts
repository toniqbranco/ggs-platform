import { createHash } from "node:crypto";
import { z } from "zod";
import { applicationSchema } from "../../src/lib/pilot/applications";
import {
  readPilotAdmission,
  type VerifiedPilotUser,
} from "../../src/lib/pilot/admission";
import { evaluatePilotPolicy } from "../../src/lib/pilot/policy";
import {
  evaluateOnboarding,
  type OnboardingContext,
} from "../../src/lib/pilot/onboarding";

// Isolated design contract: no database, SDK, network, credentials or app imports.
const revision = z.number().int().positive().max(2147483647);
export const profileFieldsSchema = z
  .object({
    displayName: applicationSchema.shape.name,
    country: applicationSchema.shape.country,
    platform: applicationSchema.shape.platform,
    profileUrl: applicationSchema.shape.profile,
    locale: z.enum(["es", "en"]),
  })
  .strict();
export const inviteIntentSchema = z
  .object({
    operationId: z.uuid(),
    applicationId: z.uuid(),
    expectedApplicationRevision: revision,
  })
  .strict();
export const profileWriteSchema = profileFieldsSchema
  .extend({
    operationId: z.uuid(),
    invitationId: z.uuid(),
    expectedBindingRevision: revision,
    expectedProfileRevision: z.number().int().min(0).max(2147483647),
  })
  .strict();
const approvedApplicationSchema = z
  .object({
    id: z.uuid(),
    revision,
    state: z.enum(["pending", "approved", "rejected", "withdrawn"]),
    decidedBy: z.uuid(),
  })
  .strict();
type Result<T> =
  | { allowed: true; value: T }
  | { allowed: false; reason: "invalid" | "denied" | "conflict" };

/** Caller must supply a fresh server getUser() result and locked/current application. */
export function reviewInviteIntent(
  input: unknown,
  context: {
    ownerId: string;
    verifiedOwner: VerifiedPilotUser | null;
    application: unknown;
  },
): Result<z.infer<typeof inviteIntentSchema>> {
  const intent = inviteIntentSchema.safeParse(input);
  if (!intent.success) return { allowed: false, reason: "invalid" };
  const application = approvedApplicationSchema.safeParse(context.application);
  if (
    !context.verifiedOwner ||
    !application.success ||
    !evaluatePilotPolicy(
      "pilot-management",
      readPilotAdmission(context.verifiedOwner, context.ownerId),
    ).allowed
  )
    return { allowed: false, reason: "denied" };
  const current = application.data;
  if (
    current.id !== intent.data.applicationId ||
    current.revision !== intent.data.expectedApplicationRevision
  )
    return { allowed: false, reason: "conflict" };
  if (current.state !== "approved" || current.decidedBy !== context.ownerId)
    return { allowed: false, reason: "denied" };
  return { allowed: true, value: intent.data };
}

/** A proposal check, not an authorization adapter or persistent write. */
export function reviewProfileWrite(
  input: unknown,
  context: {
    onboarding: OnboardingContext;
    bindingRevision: number;
    profileRevision: number;
  },
): Result<z.infer<typeof profileWriteSchema>> {
  const command = profileWriteSchema.safeParse(input);
  if (!command.success) return { allowed: false, reason: "invalid" };
  if (!evaluateOnboarding("profile", context.onboarding).allowed)
    return { allowed: false, reason: "denied" };
  if (
    command.data.invitationId !== context.onboarding.record.invitationId ||
    command.data.expectedBindingRevision !== context.bindingRevision ||
    command.data.expectedProfileRevision !== context.profileRevision
  )
    return { allowed: false, reason: "conflict" };
  return { allowed: true, value: command.data };
}

const purposes = ["invite", "profile"] as const;
const identitySchema = z
  .object({
    operationId: z.uuid(),
    actorId: z.uuid(),
    subject: z.uuid().nullable(),
    bindingId: z.uuid(),
    purpose: z.enum(purposes),
    requestHash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
const validIdentity = (value: z.infer<typeof identitySchema>) =>
  value.purpose === "invite"
    ? value.subject === null
    : value.subject !== null && value.actorId === value.subject;
export const receiptSchema = identitySchema
  .extend({
    version: z.literal(1),
    state: z.enum([
      "reserved",
      "in-flight",
      "reconcile",
      "committed",
      "rejected",
    ]),
    resultRevision: revision.nullable(),
    resolvedSubject: z.uuid().nullable(),
  })
  .strict()
  .refine(validIdentity)
  .refine((value) =>
    value.state === "committed"
      ? value.resultRevision !== null &&
        value.resolvedSubject !== null &&
        (value.purpose === "invite" || value.resolvedSubject === value.subject)
      : value.resultRevision === null && value.resolvedSubject === null,
  );

/** Hashes bind normalized intent; they are sensitive, not anonymous or safe to log. */
export function fingerprintIntent(
  purpose: "invite" | "profile",
  input: unknown,
): string {
  if (!z.enum(purposes).safeParse(purpose).success)
    throw new Error("Invalid onboarding intent");
  const schema = purpose === "invite" ? inviteIntentSchema : profileWriteSchema;
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new Error("Invalid onboarding intent");
  // Zod object parsing fixes key order and excludes no unknown fields silently.
  return createHash("sha256")
    .update(JSON.stringify({ version: 1, purpose, value: parsed.data }))
    .digest("hex");
}

export type RetryDisposition =
  | "new"
  | "reserved"
  | "replay"
  | "reconcile"
  | "blocked"
  | "conflict"
  | "invalid";
/** Classification only: no claim/lease, transaction, side effect or automatic retry. */
export function classifyReceipt(
  expected: unknown,
  stored: unknown,
): RetryDisposition {
  const identity = identitySchema.refine(validIdentity).safeParse(expected);
  if (!identity.success) return "invalid";
  if (stored === null) return "new";
  const receipt = receiptSchema.safeParse(stored);
  if (!receipt.success) return "invalid";
  for (const key of [
    "operationId",
    "actorId",
    "subject",
    "bindingId",
    "purpose",
    "requestHash",
  ] as const)
    if (identity.data[key] !== receipt.data[key]) return "conflict";
  if (receipt.data.state === "committed") return "replay";
  if (receipt.data.state === "rejected") return "blocked";
  if (receipt.data.state === "reserved") return "reserved";
  return "reconcile";
}

export const auditEventSchema = z
  .object({
    version: z.literal(1),
    operationId: z.uuid(),
    bindingId: z.uuid(),
    actorId: z.uuid(),
    subject: z.uuid().nullable(),
    revision,
    kind: z.enum([
      "invitation-reserved",
      "invitation-issued",
      "invitation-accepted",
      "invitation-revoked",
      "password-confirmed",
      "profile-saved",
      "membership-activated",
      "reconciliation-required",
      "profile-redacted",
    ]),
    occurredAt: z.iso.datetime(),
  })
  .strict()
  .refine(
    (value) =>
      value.subject !== null ||
      ["invitation-reserved", "reconciliation-required"].includes(value.kind),
  );

/** Explicit projection for minimal audit; extra context is never copied wholesale. */
export function projectAuditEvent(input: z.infer<typeof auditEventSchema>) {
  return auditEventSchema.parse({
    version: input.version,
    operationId: input.operationId,
    bindingId: input.bindingId,
    actorId: input.actorId,
    subject: input.subject,
    revision: input.revision,
    kind: input.kind,
    occurredAt: input.occurredAt,
  });
}
