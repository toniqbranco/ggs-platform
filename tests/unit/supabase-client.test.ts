import assert from "node:assert/strict";
import test from "node:test";
import { createBrowserSupabaseClient } from "../../src/lib/supabase/client";
import { SupabaseDisabledError } from "../../src/lib/supabase/config";
import { EnvironmentValidationError } from "../../src/lib/env/schema";
import { environmentKeys, supabaseFixture } from "../helpers/environment";

test("browser factory stays disconnected for empty, paired, and attempted-enable settings", () => {
  const previous = new Map(
    environmentKeys.map((key) => [key, process.env[key]]),
  );
  const fetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => {
    requests++;
    throw new Error("Unexpected network request");
  };
  try {
    for (const key of environmentKeys) delete process.env[key];
    assert.throws(createBrowserSupabaseClient, SupabaseDisabledError);
    Object.assign(process.env, supabaseFixture);
    assert.throws(createBrowserSupabaseClient, SupabaseDisabledError);
    process.env.NEXT_PUBLIC_SUPABASE_ENABLED = "true";
    assert.throws(createBrowserSupabaseClient, EnvironmentValidationError);
    assert.equal(requests, 0);
  } finally {
    globalThis.fetch = fetch;
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
