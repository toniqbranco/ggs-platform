import assert from "node:assert/strict";
import { createServerSupabaseClient } from "../../src/lib/supabase/server";
import { SupabaseDisabledError } from "../../src/lib/supabase/config";
import { EnvironmentValidationError } from "../../src/lib/env/schema";
import { supabaseFixture } from "../helpers/environment";

async function verify() {
  let requests = 0;
  globalThis.fetch = async () => {
    requests++;
    throw new Error("Unexpected network request");
  };
  await assert.rejects(createServerSupabaseClient, SupabaseDisabledError);
  Object.assign(process.env, supabaseFixture);
  await assert.rejects(createServerSupabaseClient, SupabaseDisabledError);
  process.env.NEXT_PUBLIC_SUPABASE_ENABLED = "true";
  await assert.rejects(createServerSupabaseClient, EnvironmentValidationError);
  assert.equal(requests, 0);
  console.log("server-factory-disconnected");
}
verify().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
