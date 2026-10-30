import "client-only";
import { createBrowserClient } from "@supabase/ssr";
import { getPublicEnvironment } from "@/lib/env/public";
import { requireSupabaseConfig } from "./config";
import type { Database } from "./database.types";

export function createBrowserSupabaseClient() {
  const config = requireSupabaseConfig(getPublicEnvironment());
  return createBrowserClient<Database>(config.url, config.publishableKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
      skipAutoInitialize: true,
    },
  });
}
