import "server-only";
import { z } from "zod";
import type { AuthGateway } from "@/lib/auth/flow";
import { readPilotAdmission } from "@/lib/pilot/admission";
import { evaluatePilotPolicy } from "@/lib/pilot/policy";
import { applicationSchema } from "@/lib/pilot/applications";

// Proposal only: injected channels; no credentials or application import.
export type ProposalQuery = {
  query(
    sql: string,
    values: unknown[],
  ): Promise<{ rows: Record<string, unknown>[] }>;
};
type Dependencies = {
  intake: ProposalQuery;
  review: ProposalQuery;
  verify: AuthGateway["verify"];
  ownerUserId: string;
};
export type StoreFailure =
  "invalid" | "denied" | "conflict" | "missing" | "unavailable";
export class ApplicationStoreError extends Error {
  constructor(public readonly reason: StoreFailure) {
    super(`Application storage: ${reason}`);
    this.name = "ApplicationStoreError";
  }
}
const submitSchema = applicationSchema
  .extend({ operationId: z.uuid(), locale: z.enum(["es", "en"]) })
  .strict();
const decisionSchema = z
  .object({
    applicationId: z.uuid(),
    operationId: z.uuid(),
    expectedRevision: z.number().int().positive().max(2147483647),
    decision: z.enum(["approved", "rejected"]),
  })
  .strict();
const listSchema = z
  .object({
    state: z.enum(["pending", "approved", "rejected", "withdrawn"]).optional(),
    after: z
      .object({ createdAt: z.iso.datetime({ offset: true }), id: z.uuid() })
      .strict()
      .optional(),
    limit: z.number().int().min(1).max(50).default(25),
  })
  .strict();
const historySchema = z
  .object({
    applicationId: z.uuid(),
    afterRevision: z.number().int().min(0).max(2147483647).default(0),
  })
  .strict();
const timestamp = z.union([
  z.date().transform((value) => value.toISOString()),
  z.iso.datetime({ offset: true }),
]);
const applicationRow = z.object({
  id: z.uuid(),
  creator_name: z.string(),
  email: z.email(),
  country: z.string(),
  platform: z.enum(["tiktok", "twitch", "youtube", "other"]),
  profile_url: z.url(),
  locale: z.enum(["es", "en"]),
  review_state: z.enum(["pending", "approved", "rejected", "withdrawn"]),
  revision: z.number().int().positive(),
  created_at: timestamp,
});
const eventRow = z.object({
  id: z.uuid(),
  application_id: z.uuid(),
  event_kind: z.enum(["submitted", "approved", "rejected", "withdrawn"]),
  revision: z.number().int().positive(),
  occurred_at: timestamp,
});

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new ApplicationStoreError("invalid");
  return result.data;
}
async function query(database: ProposalQuery, sql: string, values: unknown[]) {
  try {
    return await database.query(sql, values);
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? error.code
        : null;
    throw new ApplicationStoreError(
      code === "P0003"
        ? "conflict"
        : code === "P0002"
          ? "missing"
          : code === "42501"
            ? "denied"
            : code === "23514" || code === "23502" || code === "22023"
              ? "invalid"
              : "unavailable",
    );
  }
}
export function createApplicationStorageProposal(deps: Dependencies) {
  async function owner() {
    try {
      const { data, error } = await deps.verify();
      if (
        error ||
        !data.user ||
        data.user.id !== deps.ownerUserId ||
        !evaluatePilotPolicy(
          "pilot-management",
          readPilotAdmission(data.user, deps.ownerUserId),
        ).allowed
      )
        throw new Error("Denied");
      return data.user.id;
    } catch {
      throw new ApplicationStoreError("denied");
    }
  }
  return {
    async submit(input: unknown) {
      const value = parse(submitSchema, input);
      await query(
        deps.intake,
        "select ggs_pilot.submit_application($1::uuid,$2::text,$3::text,$4::text,$5::text,$6::text,$7::text)",
        [
          value.operationId,
          value.name,
          value.email,
          value.country,
          value.platform,
          value.profile,
          value.locale,
        ],
      );
      return { received: true } as const;
    },
    async decide(input: unknown) {
      const actor = await owner();
      const value = parse(decisionSchema, input);
      const result = await query(
        deps.review,
        "select ggs_pilot.decide_application($1::uuid,$2::uuid,$3::uuid,$4::integer,$5::text,$6::text) as revision",
        [
          actor,
          value.operationId,
          value.applicationId,
          value.expectedRevision,
          value.decision,
          value.decision === "approved" ? "fit" : "not-ready",
        ],
      );
      if (result.rows[0]?.revision !== 2)
        throw new ApplicationStoreError("unavailable");
      return { revision: 2 } as const;
    },
    async list(input: unknown = {}) {
      const actor = await owner();
      const value = parse(listSchema, input);
      const result = await query(
        deps.review,
        "select * from ggs_pilot.list_applications($1::uuid,$2::text,$3::timestamptz,$4::uuid,$5::integer)",
        [
          actor,
          value.state ?? null,
          value.after?.createdAt ?? null,
          value.after?.id ?? null,
          value.limit,
        ],
      );
      const parsed = z.array(applicationRow).safeParse(result.rows);
      if (!parsed.success) throw new ApplicationStoreError("unavailable");
      return parsed.data.map((row) => ({
        id: row.id,
        name: row.creator_name,
        email: row.email,
        country: row.country,
        platform: row.platform,
        profile: row.profile_url,
        locale: row.locale,
        state: row.review_state,
        revision: row.revision,
        createdAt: row.created_at,
      }));
    },
    async history(input: unknown) {
      const actor = await owner();
      const value = parse(historySchema, input);
      const result = await query(
        deps.review,
        "select * from ggs_pilot.application_history($1::uuid,$2::uuid,$3::integer)",
        [actor, value.applicationId, value.afterRevision],
      );
      const parsed = z.array(eventRow).safeParse(result.rows);
      if (!parsed.success) throw new ApplicationStoreError("unavailable");
      return parsed.data.map((row) => ({
        id: row.id,
        applicationId: row.application_id,
        kind: row.event_kind,
        revision: row.revision,
        occurredAt: row.occurred_at,
      }));
    },
  };
}
