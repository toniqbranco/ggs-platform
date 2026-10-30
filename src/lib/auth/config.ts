import { z } from "zod";

export const approvedPilotOrigin = "https://rchxnmpsxfbsicthasxn.supabase.co";
export const pilotAuthCookieName = "sb-rchxnmpsxfbsicthasxn-auth-token";

const schema = z.object({
  PILOT_AUTH_ENABLED: z.enum(["false", "true"]).default("false"),
  PILOT_SUPABASE_URL: z.string().optional(),
  PILOT_SUPABASE_PUBLISHABLE_KEY: z.string().optional(),
  PILOT_OWNER_USER_ID: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.uuid().optional(),
  ),
  APP_ENV: z
    .enum(["development", "test", "staging", "production"])
    .default("development"),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
});

export type PilotAuthConfig =
  | { enabled: false }
  | {
      enabled: true;
      url: string;
      publishableKey: string;
      appOrigin: string;
      ownerUserId?: string | undefined;
    };

export function parsePilotAuthConfig(input: unknown): PilotAuthConfig {
  const result = schema.safeParse(input);
  // Do not include configured values or Zod's input in diagnostic messages.
  if (!result.success)
    throw new Error("Invalid pilot authentication configuration.");
  const env = result.data;
  if (env.PILOT_AUTH_ENABLED === "false") return { enabled: false };
  const app = new URL(env.NEXT_PUBLIC_APP_URL);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(app.hostname);
  if (
    env.APP_ENV === "production" ||
    env.PILOT_SUPABASE_URL !== approvedPilotOrigin ||
    !/^sb_publishable_[A-Za-z0-9_-]+$/.test(
      env.PILOT_SUPABASE_PUBLISHABLE_KEY ?? "",
    ) ||
    app.username ||
    app.password ||
    app.pathname !== "/" ||
    app.search ||
    app.hash ||
    (app.protocol !== "https:" && !(local && app.protocol === "http:"))
  ) {
    throw new Error(
      "Pilot sign-in requires the approved non-production project, a publishable key, and a safe application origin.",
    );
  }
  return {
    enabled: true,
    url: approvedPilotOrigin,
    publishableKey: env.PILOT_SUPABASE_PUBLISHABLE_KEY!,
    appOrigin: app.origin,
    ownerUserId: env.PILOT_OWNER_USER_ID,
  };
}
