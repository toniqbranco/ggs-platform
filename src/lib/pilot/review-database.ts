import "server-only";
import { withTestingReadOnlyClient } from "./testing-readonly";
import { z } from "zod";
import { readReviewCredential } from "./review-credential";
import {
  reviewRequestSchema,
  storedApplicationSchema,
  storedEventSchema,
  type ReviewRequest,
} from "./stored-review-contract";

export async function readStoredReview(
  input: ReviewRequest,
  ownerId: string,
  signal: AbortSignal,
  dependencies: {
    credential?: typeof readReviewCredential;
    certificate?: () => Promise<string>;
  } = {},
) {
  const value = reviewRequestSchema.parse(input);
  z.uuid().parse(ownerId);
  if (
    process.env.APP_ENV !== "development" ||
    process.env.NODE_ENV === "production" ||
    process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0" ||
    signal.aborted
  )
    throw new Error("Private review unavailable.");
  const credential = await (dependencies.credential ?? readReviewCredential)(
    signal,
  );
  return withTestingReadOnlyClient(
    "ggs_pilot_review_login",
    credential,
    signal,
    async (client) => {
      if (value.operation === "history") {
        const result = await client.query(
          "select event_kind,revision,occurred_at from ggs_pilot.application_history($1::uuid,$2::uuid,0)",
          [ownerId, value.applicationId],
        );
        return {
          events: z
            .array(storedEventSchema)
            .max(2)
            .parse(
              result.rows.map((row) => ({
                kind: row.event_kind,
                revision: row.revision,
                occurredAt: row.occurred_at,
              })),
            ),
        };
      }
      // One bounded page for the pilot. No arbitrary SQL, mutations or intake client.
      const result = await client.query(
        "select * from ggs_pilot.list_applications($1::uuid,null,null,null,50)",
        [ownerId],
      );
      return {
        applications: z
          .array(storedApplicationSchema)
          .max(50)
          .parse(
            result.rows.map((row) => ({
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
            })),
          ),
        bounded: true,
      };
    },
    dependencies.certificate,
  );
}
