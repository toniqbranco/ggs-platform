import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getServerEnvironment } from "@/lib/env/server";
import { requireSupabaseConfig } from "./config";
import type { Database } from "./database.types";

export async function createServerSupabaseClient() {
  // Fail before reading request cookies or initializing the SDK in WP-01.
  const config = requireSupabaseConfig(getServerEnvironment());
  const cookieStore = await cookies();

  // Always request-scoped; never share a server client across visitors.
  return createServerClient<Database>(config.url, config.publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(values) {
        // Future callers must use a context that permits cookie writes.
        // Do not swallow errors or claim refreshed sessions were persisted.
        for (const { name, value, options } of values)
          cookieStore.set(name, value, options);
      },
    },
  });
}
