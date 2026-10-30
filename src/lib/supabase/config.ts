import type { PublicEnvironment } from "@/lib/env/schema";

export class SupabaseDisabledError extends Error {
  constructor() {
    super(
      "Supabase connections are disabled for WP-01. Service integration requires a later approved change.",
    );
    this.name = "SupabaseDisabledError";
  }
}

export function requireSupabaseConfig(env: PublicEnvironment): {
  url: string;
  publishableKey: string;
} {
  // The schema only accepts false. Enabling requires changing and reviewing code,
  // not just setting an environment flag or supplying credentials.
  if (!env.NEXT_PUBLIC_SUPABASE_ENABLED) throw new SupabaseDisabledError();
  if (
    !env.NEXT_PUBLIC_SUPABASE_URL ||
    !env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  ) {
    throw new Error("Supabase URL and publishable key are required.");
  }
  return {
    url: env.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  };
}
