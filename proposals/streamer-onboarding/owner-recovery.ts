import "server-only";
import { z } from "zod";
import type { OnboardingQuery } from "./adapter";
import {
  readPilotAdmission,
  type VerifiedPilotUser,
} from "../../src/lib/pilot/admission";
import { evaluatePilotPolicy } from "../../src/lib/pilot/policy";

const revision = z.number().int().positive().max(2147483647);
const commandSchema = z
  .object({
    operationId: z.uuid(),
    expectedVersion: revision.max(2147483646),
    reviewId: z.uuid(),
    decision: z.enum(["verified", "no-effect"]),
  })
  .strict();
const operationSchema = z
  .object({
    operationId: z.uuid(),
    invitationId: z.uuid(),
    subject: z.uuid(),
    kind: z.enum(["invitation", "password"]),
    expectedBindingRevision: revision,
    version: revision,
    state: z.enum(["claimed", "reconcile", "verified", "abandoned"]),
    leaseUntil: z.iso.datetime(),
    reviewId: z.uuid().nullable(),
    decision: z.enum(["verified", "no-effect"]).nullable(),
    resolvedBy: z.uuid().nullable(),
    evidenceId: z.uuid().nullable(),
  })
  .strict()
  .refine((value) => {
    const resolved = value.reviewId !== null;
    return (
      resolved === (value.decision !== null) &&
      resolved === (value.resolvedBy !== null) &&
      (value.state === "verified") === (value.evidenceId !== null) &&
      (value.state !== "abandoned" || value.decision === "no-effect") &&
      (!resolved ||
        value.state ===
          (value.decision === "verified" ? "verified" : "abandoned"))
    );
  });
export type RecoveryOperation = z.infer<typeof operationSchema>;
const inspectionSchema = z
  .object({
    operationId: z.uuid(),
    invitationId: z.uuid(),
    subject: z.uuid(),
    kind: z.enum(["invitation", "password"]),
    expectedBindingRevision: revision,
    version: revision,
    reviewId: z.uuid(),
    decision: z.enum(["verified", "no-effect"]),
    ownerId: z.uuid(),
  })
  .strict();
export type RecoveryInspection = z.infer<typeof inspectionSchema>;
const evidenceSchema = inspectionSchema
  .extend({
    confirmed: z.literal(true),
    workerStopped: z.literal(true),
    providerSettled: z.literal(true),
    observedAt: z.iso.datetime(),
    evidenceId: z.uuid().nullable(),
  })
  .strict()
  .refine(
    (value) => (value.decision === "verified") === (value.evidenceId !== null),
  );
type Dependencies = {
  mode?: "disabled" | "isolated-fixture";
  ownerUserId: string;
  operator: OnboardingQuery;
  verify(): Promise<{
    data: { user: VerifiedPilotUser | null };
    error: unknown | null;
  }>;
  inspectProvider(request: RecoveryInspection): Promise<unknown>;
};
export class RecoveryError extends Error {
  constructor(
    public readonly reason:
      | "invalid"
      | "denied"
      | "conflict"
      | "unavailable"
      | "reconciliation-required",
  ) {
    super(`Owner recovery: ${reason}`);
    this.name = "RecoveryError";
  }
}
/** Isolated orchestration only. The injected inspector must never infer non-effect from a timeout. */
export function createOwnerRecoveryAdapter(deps: Dependencies) {
  function guard() {
    if (
      deps.mode !== "isolated-fixture" ||
      process.env.APP_ENV !== "test" ||
      process.env.NODE_ENV === "production" ||
      !z.uuid().safeParse(deps.ownerUserId).success
    )
      throw new RecoveryError("unavailable");
  }
  guard();
  async function owner() {
    guard();
    let result: Awaited<ReturnType<Dependencies["verify"]>>;
    try {
      result = await deps.verify();
    } catch {
      throw new RecoveryError("unavailable");
    }
    if (!result || result.error) throw new RecoveryError("unavailable");
    const user = result.data?.user;
    const confirmed = z.iso
      .datetime({ offset: true })
      .safeParse(user?.email_confirmed_at);
    const admission = user ? readPilotAdmission(user, deps.ownerUserId) : null;
    if (
      !user ||
      user.id !== deps.ownerUserId ||
      user.is_anonymous !== false ||
      !confirmed.success ||
      Date.parse(confirmed.data) > Date.now() ||
      !evaluatePilotPolicy("pilot-management", admission).allowed
    )
      throw new RecoveryError("denied");
    return user.id;
  }
  async function query(sql: string, values: unknown[], writing = false) {
    guard();
    try {
      const rows = (await deps.operator.query(sql, values)).rows;
      if (rows.length !== 1 || !rows[0]) throw new Error("Invalid response");
      return rows[0].result;
    } catch (error) {
      const code = (error as { code?: unknown } | null)?.code;
      throw new RecoveryError(
        code === "42501"
          ? "denied"
          : code === "P0003" || code === "23505"
            ? "conflict"
            : writing
              ? "reconciliation-required"
              : "unavailable",
      );
    }
  }
  async function prepare(actor: string, operationId: string) {
    const raw = await query(
      "select ggs_onboarding.prepare_provider_review($1,$2) result",
      [actor, operationId],
      true,
    );
    const result = operationSchema.safeParse(raw);
    if (!result.success || result.data.operationId !== operationId)
      throw new RecoveryError("unavailable");
    return result.data;
  }
  return {
    async prepare(input: unknown) {
      guard();
      const command = z
        .object({ operationId: z.uuid() })
        .strict()
        .safeParse(input);
      if (!command.success) throw new RecoveryError("invalid");
      return prepare(await owner(), command.data.operationId);
    },
    async resolve(input: unknown) {
      guard();
      const parsed = commandSchema.safeParse(input);
      if (!parsed.success) throw new RecoveryError("invalid");
      const command = parsed.data;
      const actor = await owner();
      const snapshot = await prepare(actor, command.operationId);
      if (snapshot.reviewId !== null) {
        if (
          snapshot.reviewId !== command.reviewId ||
          snapshot.decision !== command.decision ||
          snapshot.resolvedBy !== actor ||
          snapshot.version !== command.expectedVersion + 1
        )
          throw new RecoveryError("conflict");
        return { revision: snapshot.version, receipt: true };
      }
      if (
        snapshot.state !== "reconcile" ||
        snapshot.version !== command.expectedVersion
      )
        throw new RecoveryError("conflict");
      const request: RecoveryInspection = {
        operationId: snapshot.operationId,
        invitationId: snapshot.invitationId,
        subject: snapshot.subject,
        kind: snapshot.kind,
        expectedBindingRevision: snapshot.expectedBindingRevision,
        version: snapshot.version,
        reviewId: command.reviewId,
        decision: command.decision,
        ownerId: actor,
      };
      let raw: unknown;
      try {
        raw = await deps.inspectProvider({ ...request });
      } catch {
        throw new RecoveryError("unavailable");
      }
      guard();
      const evidence = evidenceSchema.safeParse(raw);
      if (
        !evidence.success ||
        Object.keys(request).some(
          (key) =>
            evidence.data[key as keyof RecoveryInspection] !==
            request[key as keyof RecoveryInspection],
        ) ||
        Date.parse(evidence.data.observedAt) > Date.now() ||
        Date.parse(evidence.data.observedAt) < Date.now() - 60000
      )
        throw new RecoveryError("denied");
      if ((await owner()) !== actor) throw new RecoveryError("denied");
      const fresh = await prepare(actor, command.operationId);
      if (JSON.stringify(fresh) !== JSON.stringify(snapshot))
        throw new RecoveryError("conflict");
      if (
        Date.parse(evidence.data.observedAt) > Date.now() ||
        Date.parse(evidence.data.observedAt) < Date.now() - 60000
      )
        throw new RecoveryError("denied");
      const result = await query(
        "select ggs_onboarding.resolve_provider_step($1,$2,$3,$4,$5,$6) result",
        [
          actor,
          command.operationId,
          command.expectedVersion,
          command.decision,
          command.reviewId,
          evidence.data.evidenceId,
        ],
        true,
      );
      if (
        !z.number().int().positive().safeParse(result).success ||
        result !== command.expectedVersion + 1
      )
        throw new RecoveryError("reconciliation-required");
      return { revision: result as number, receipt: false };
    },
  };
}
