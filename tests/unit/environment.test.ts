import assert from "node:assert/strict";
import test from "node:test";
import {
  EnvironmentValidationError,
  parsePublicEnvironment,
  parseServerEnvironment,
} from "../../src/lib/env/schema";
import { supabaseFixture } from "../helpers/environment";

test("missing and blank environment values preserve the disconnected defaults", () => {
  for (const input of [
    {},
    {
      NEXT_PUBLIC_APP_URL: " ",
      NEXT_PUBLIC_SUPABASE_ENABLED: "",
      NEXT_PUBLIC_SUPABASE_URL: "",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: " ",
    },
  ]) {
    const env = parseServerEnvironment(input);
    assert.equal(env.NEXT_PUBLIC_APP_URL, "http://localhost:3000");
    assert.equal(env.APP_ENV, "development");
    assert.equal(env.NEXT_PUBLIC_SUPABASE_ENABLED, false);
    assert.equal(env.NEXT_PUBLIC_SUPABASE_URL, undefined);
  }
});

for (const origin of [
  "http://localhost:3103",
  "http://127.0.0.1:3103",
  "http://[::1]:3103",
  "https://example.invalid",
]) {
  test(`accepts an application origin: ${origin}`, () => {
    assert.equal(
      parsePublicEnvironment({ NEXT_PUBLIC_APP_URL: origin })
        .NEXT_PUBLIC_APP_URL,
      origin,
    );
  });
}

for (const origin of [
  "invalid",
  "http://example.invalid",
  "http://localhost.evil.invalid",
  "https://example.invalid/path",
  "https://example.invalid/?q=1",
  "https://example.invalid/#fragment",
  "https://user:sentinel_password@example.invalid",
  "file:///tmp/example",
]) {
  test(`rejects unsafe or non-origin URLs: ${origin.replace("sentinel_password", "[fixture]")}`, () => {
    assert.throws(
      () => parsePublicEnvironment({ NEXT_PUBLIC_APP_URL: origin }),
      EnvironmentValidationError,
    );
  });
}

for (const value of ["true", "TRUE", "0", "yes", true, false]) {
  test(`rejects an enable flag other than the string false: ${String(value)} (${typeof value})`, () => {
    assert.throws(
      () => parseServerEnvironment({ NEXT_PUBLIC_SUPABASE_ENABLED: value }),
      EnvironmentValidationError,
    );
  });
}

test("syntactically valid paired fixture fields do not enable Supabase", () => {
  assert.equal(
    parseServerEnvironment(supabaseFixture).NEXT_PUBLIC_SUPABASE_ENABLED,
    false,
  );
});

for (const field of Object.keys(
  supabaseFixture,
) as (keyof typeof supabaseFixture)[]) {
  test(`rejects incomplete Supabase configuration: only ${field}`, () => {
    assert.throws(
      () => parseServerEnvironment({ [field]: supabaseFixture[field] }),
      EnvironmentValidationError,
    );
  });
}

for (const key of ["sb_secret_artificial", "eyJ_legacy_artificial"]) {
  test(`publishable field rejects a ${key.startsWith("sb_secret") ? "secret" : "legacy"} key`, () => {
    assert.throws(
      () =>
        parseServerEnvironment({
          ...supabaseFixture,
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key,
        }),
      EnvironmentValidationError,
    );
  });
}

for (const APP_ENV of ["development", "test", "staging", "production"]) {
  test(`accepts server deployment label ${APP_ENV}`, () => {
    assert.equal(parseServerEnvironment({ APP_ENV }).APP_ENV, APP_ENV);
  });
}

test("unknown deployment labels fail", () => {
  assert.throws(
    () => parseServerEnvironment({ APP_ENV: "unsupported" }),
    EnvironmentValidationError,
  );
});

for (const field of [
  "SUPABASE_SECRET_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_SUPABASE_SECRET_KEY",
  "NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
]) {
  test(`rejects ${field} without exposing its supplied value`, () => {
    assert.throws(
      () => parseServerEnvironment({ [field]: "sentinel_do_not_log" }),
      (error: unknown) => {
        assert.ok(error instanceof EnvironmentValidationError);
        assert.ok(error.message.includes(field));
        assert.ok(!error.message.includes("sentinel_do_not_log"));
        return true;
      },
    );
  });
}

test("public parsing strips server-only and unrecognized fields", () => {
  const env = parsePublicEnvironment({
    APP_ENV: "production",
    PRIVATE_VALUE: "sentinel_do_not_log",
  });
  assert.ok(!("APP_ENV" in env));
  assert.ok(!JSON.stringify(env).includes("sentinel_do_not_log"));
});
