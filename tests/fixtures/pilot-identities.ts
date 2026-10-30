import type { PilotPolicyContext } from "../../src/lib/pilot/policy";

// Status-only fixtures, never identities/accounts and never imported by app routes.
export const pilotIdentities = {
  visitor: {
    session: "absent",
    invitation: "not-invited",
    membership: "pending",
    roles: [],
  },
  owner: {
    session: "valid",
    invitation: "accepted",
    membership: "active",
    roles: ["owner"],
  },
  hq: {
    session: "valid",
    invitation: "accepted",
    membership: "active",
    roles: ["admin"],
  },
  streamer: {
    session: "valid",
    invitation: "accepted",
    membership: "active",
    roles: ["streamer"],
  },
} satisfies Record<string, PilotPolicyContext>;
