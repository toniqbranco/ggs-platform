import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  fixtureOperationSchema,
  setupCommandSchema,
  FixtureGatewayError,
  type FixtureOperation,
  type FixtureOperationStore,
} from "./fixture-gateway";
import type { OnboardingQuery } from "./adapter";

const keySchema = setupCommandSchema
  .extend({ kind: z.enum(["invitation", "password"]) })
  .strict();
type Options = {
  mode?: "disabled" | "isolated-fixture";
  channel: OnboardingQuery;
};
function guard(options: Options) {
  if (
    options.mode !== "isolated-fixture" ||
    process.env.APP_ENV !== "test" ||
    process.env.NODE_ENV === "production"
  )
    throw new FixtureGatewayError("unavailable");
}
function invalid(): never {
  throw new FixtureGatewayError("invalid");
}
/** Inject a restricted disposable PostgreSQL channel. No connection or credential loader. */
export function createFixtureOperationStore(
  options: Options,
): FixtureOperationStore {
  guard(options);
  async function query(sql: string, values: unknown[]) {
    guard(options);
    try {
      const result = await options.channel.query(sql, values);
      if (result.rows.length !== 1 || !result.rows[0])
        throw new Error("Invalid result");
      return result.rows[0].result;
    } catch (error) {
      const code = (error as { code?: unknown } | null)?.code;
      throw new FixtureGatewayError(
        code === "42501"
          ? "denied"
          : code === "P0003" || code === "23505"
            ? "reconciliation-required"
            : "unavailable",
      );
    }
  }
  function parsedOperation(raw: unknown) {
    const parsed = fixtureOperationSchema.safeParse(raw);
    if (!parsed.success) throw new FixtureGatewayError("unavailable");
    return parsed.data;
  }
  function claimed(raw: FixtureOperation) {
    guard(options);
    const row = parsedOperation(raw);
    if (row.state !== "claimed" || !row.claimId) invalid();
    return row;
  }
  return {
    async claim(input, subject) {
      guard(options);
      const key = keySchema.safeParse(input);
      if (
        !key.success ||
        (subject !== null && !z.uuid().safeParse(subject).success) ||
        (key.data.kind === "invitation") !== (subject === null)
      )
        invalid();
      const k = key.data;
      return parsedOperation(
        await query(
          "select ggs_onboarding.claim_provider_step($1,$2,$3,$4,$5,$6) result",
          [
            k.kind,
            k.invitationId,
            k.operationId,
            k.expectedBindingRevision,
            subject,
            randomUUID(),
          ],
        ),
      );
    },
    async read(input, subject) {
      guard(options);
      const key = keySchema.safeParse(input);
      if (!key.success || !z.uuid().safeParse(subject).success) invalid();
      const k = key.data;
      return parsedOperation(
        await query(
          "select ggs_onboarding.read_provider_step($1,$2,$3,$4,$5) result",
          [
            k.kind,
            k.invitationId,
            k.operationId,
            k.expectedBindingRevision,
            subject,
          ],
        ),
      );
    },
    async verified(operation, evidence) {
      const row = claimed(operation);
      if (!z.uuid().safeParse(evidence).success) invalid();
      const result = parsedOperation(
        await query(
          "select ggs_onboarding.verify_provider_step($1,$2,$3) result",
          [row.operationId, row.claimId, evidence],
        ),
      );
      if (
        result.state !== "verified" ||
        result.evidenceId !== evidence ||
        result.operationId !== row.operationId ||
        result.kind !== row.kind ||
        result.expectedBindingRevision !== row.expectedBindingRevision ||
        result.subject !== row.subject ||
        result.invitationId !== row.invitationId
      )
        throw new FixtureGatewayError("reconciliation-required");
    },
    async uncertain(operation) {
      const row = claimed(operation);
      if (
        (await query(
          "select ggs_onboarding.uncertain_provider_step($1,$2) result",
          [row.operationId, row.claimId],
        )) !== true
      )
        throw new FixtureGatewayError("unavailable");
    },
  };
}
