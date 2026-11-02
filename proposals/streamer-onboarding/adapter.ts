import "server-only";
import { z } from "zod";
import { profileFieldsSchema, profileWriteSchema } from "./contract";
import {
  readPilotAdmission,
  type VerifiedPilotUser,
} from "../../src/lib/pilot/admission";

export type OnboardingQuery = {
  query(
    sql: string,
    values: unknown[],
  ): Promise<{ rows: Record<string, unknown>[] }>;
};
export type EvidenceRequest = {
  kind: "invitation" | "password";
  subject: string;
  invitationId: string;
  operationId: string;
  expectedBindingRevision: number;
};
type Dependencies = {
  mode?: "disabled" | "isolated-fixture";
  ownerUserId: string;
  verify(): Promise<{
    data: { user: VerifiedPilotUser | null };
    error: unknown | null;
  }>;
  // Trusted injected evidence reader; no password/token/form input reaches it here.
  verifyEvidence(request: EvidenceRequest): Promise<unknown>;
  setup: OnboardingQuery;
  reader: OnboardingQuery;
};
type Failure =
  "invalid" | "denied" | "conflict" | "unavailable" | "reconciliation-required";
export class OnboardingAdapterError extends Error {
  constructor(public readonly reason: Failure) {
    super(`Onboarding adapter: ${reason}`);
    this.name = "OnboardingAdapterError";
  }
}
const revision = z.number().int().positive().max(2147483647);
const readSchema = z.object({ invitationId: z.uuid() }).strict();
const commandSchema = readSchema
  .extend({ operationId: z.uuid(), expectedBindingRevision: revision })
  .strict();
const evidenceSchema = commandSchema
  .extend({
    subject: z.uuid(),
    kind: z.enum(["invitation", "password"]),
    evidenceId: z.uuid(),
    verified: z.literal(true),
  })
  .strict();
const selfSchema = z
  .object({
    membership: z.enum(["pending", "active"]),
    bindingRevision: revision,
    profile: profileFieldsSchema.extend({ revision }).strict().nullable(),
  })
  .strict();
const resultSchema = z.object({ revision }).strict();
function invalid(): never {
  throw new OnboardingAdapterError("invalid");
}
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  return result.success ? result.data : invalid();
}

/** Isolated proposal only. No environment switch, transport or live SDK is wired. */
export function createOnboardingAdapter(deps: Dependencies) {
  function guard() {
    if (
      deps.mode !== "isolated-fixture" ||
      process.env.APP_ENV !== "test" ||
      process.env.NODE_ENV === "production" ||
      !z.uuid().safeParse(deps.ownerUserId).success
    )
      throw new OnboardingAdapterError("unavailable");
  }
  async function identity() {
    guard();
    let result: Awaited<ReturnType<Dependencies["verify"]>>;
    try {
      result = await deps.verify();
    } catch {
      throw new OnboardingAdapterError("unavailable");
    }
    if (!result || result.error)
      throw new OnboardingAdapterError("unavailable");
    const user = result.data?.user;
    const confirmed = z.iso
      .datetime({ offset: true })
      .safeParse(user?.email_confirmed_at);
    if (
      !user ||
      !z.uuid().safeParse(user.id).success ||
      user.is_anonymous !== false ||
      !confirmed.success ||
      Date.parse(confirmed.data) > Date.now() ||
      user.id === deps.ownerUserId
    )
      throw new OnboardingAdapterError("denied");
    const priorAdmission = readPilotAdmission(user, deps.ownerUserId);
    if (
      priorAdmission?.roles.some((role) => role === "owner" || role === "admin")
    )
      throw new OnboardingAdapterError("denied");
    return user.id;
  }
  async function query<T>(
    channel: OnboardingQuery,
    sql: string,
    values: unknown[],
    schema: z.ZodType<T>,
  ) {
    guard();
    let rows: Record<string, unknown>[];
    try {
      rows = (await channel.query(sql, values)).rows;
    } catch (error) {
      const code =
        typeof error === "object" && error !== null && "code" in error
          ? error.code
          : null;
      throw new OnboardingAdapterError(
        code === "42501"
          ? "denied"
          : code === "P0003" || code === "23505"
            ? "conflict"
            : code === "22023" ||
                code === "23514" ||
                code === "23502" ||
                code === "22P02"
              ? "invalid"
              : "unavailable",
      );
    }
    if (!Array.isArray(rows) || rows.length !== 1)
      throw new OnboardingAdapterError("unavailable");
    const parsed = schema.safeParse(rows[0]);
    if (!parsed.success) throw new OnboardingAdapterError("unavailable");
    return parsed.data;
  }
  async function transition(
    subject: string,
    command: z.infer<typeof commandSchema>,
    action: "accept" | "password" | "profile" | "finalize",
    payload: object,
  ) {
    return query(
      deps.setup,
      "select ggs_onboarding.setup_transition($1,$2,$3,$4,$5,$6) revision",
      [
        subject,
        command.invitationId,
        command.operationId,
        command.expectedBindingRevision,
        action,
        JSON.stringify(payload),
      ],
      resultSchema,
    );
  }
  async function recordEvidence(kind: EvidenceRequest["kind"], input: unknown) {
    guard();
    const command = parse(commandSchema, input);
    const subject = await identity();
    const request: EvidenceRequest = { ...command, subject, kind };
    let raw: unknown;
    try {
      raw = await deps.verifyEvidence(request);
    } catch {
      throw new OnboardingAdapterError("unavailable");
    }
    const proof = evidenceSchema.safeParse(raw);
    if (
      !proof.success ||
      proof.data.subject !== subject ||
      proof.data.kind !== kind ||
      proof.data.invitationId !== command.invitationId ||
      proof.data.operationId !== command.operationId ||
      proof.data.expectedBindingRevision !== command.expectedBindingRevision
    )
      throw new OnboardingAdapterError("denied");
    // Evidence lookup may take time; never reuse the first identity across it.
    if ((await identity()) !== subject)
      throw new OnboardingAdapterError("denied");
    try {
      return await transition(
        subject,
        command,
        kind === "invitation" ? "accept" : "password",
        { evidence: proof.data.evidenceId },
      );
    } catch (error) {
      if (
        error instanceof OnboardingAdapterError &&
        error.reason !== "unavailable"
      )
        throw error;
      // Evidence may reflect an already completed provider operation. Never repeat it.
      throw new OnboardingAdapterError("reconciliation-required");
    }
  }
  return {
    async readSelf(input: unknown) {
      guard();
      const command = parse(readSchema, input);
      const subject = await identity();
      const row = await query(
        deps.reader,
        "select ggs_onboarding.read_self($1,$2) result",
        [subject, command.invitationId],
        z.object({ result: selfSchema }).strict(),
      );
      // This proposal does not open an operational streamer workspace.
      return { ...row.result, workspaceAccess: false as const };
    },
    async saveProfile(input: unknown) {
      guard();
      const command = parse(profileWriteSchema, input);
      const subject = await identity();
      const {
        displayName,
        country,
        platform,
        profileUrl,
        locale,
        expectedProfileRevision,
      } = command;
      return transition(subject, command, "profile", {
        displayName,
        country,
        platform,
        profileUrl,
        locale,
        expectedProfileRevision,
      });
    },
    async finalize(input: unknown) {
      guard();
      const command = parse(commandSchema, input);
      const subject = await identity();
      return transition(subject, command, "finalize", {});
    },
    recordVerifiedInvitation: (input: unknown) =>
      recordEvidence("invitation", input),
    recordVerifiedPassword: (input: unknown) =>
      recordEvidence("password", input),
  };
}
