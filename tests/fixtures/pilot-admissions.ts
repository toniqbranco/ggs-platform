import type { VerifiedPilotUser } from "../../src/lib/pilot/admission";

export const fixtureOwnerId = "00000000-0000-4000-8000-000000000001";
export function approvedFixtureUser(
  role: "owner" | "admin" | "streamer" = "streamer",
) {
  const id =
    role === "owner"
      ? fixtureOwnerId
      : role === "admin"
        ? "00000000-0000-4000-8000-000000000003"
        : "00000000-0000-4000-8000-000000000002";
  return {
    id,
    email_confirmed_at: "2020-01-01T00:00:00Z",
    is_anonymous: false,
    app_metadata: {
      ggs_pilot: {
        version: 1,
        subject: id,
        approved_by: fixtureOwnerId,
        approved_at: "2020-01-01T00:00:00Z",
        approval: "approved",
        invitation: "accepted",
        membership: "active",
        roles: [role],
      },
    },
  } satisfies VerifiedPilotUser;
}
