import { parsePublicEnvironment } from "./schema";

export function getPublicEnvironment() {
  // Direct references are required for Next.js build-time public-variable inlining.
  return parsePublicEnvironment({
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SUPABASE_ENABLED: process.env.NEXT_PUBLIC_SUPABASE_ENABLED,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
}
