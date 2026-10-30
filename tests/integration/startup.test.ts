import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { cleanEnvironment } from "../helpers/environment";

const next = path.resolve("node_modules/next/dist/bin/next");
for (const scenario of [
  { command: "build", field: "NEXT_PUBLIC_SUPABASE_ENABLED", value: "true" },
  { command: "start", field: "NEXT_PUBLIC_SUPABASE_ENABLED", value: "true" },
  {
    command: "build",
    field: "SUPABASE_SERVICE_ROLE_KEY",
    value: "sentinel_do_not_log",
  },
  {
    command: "build",
    field: "NEXT_PUBLIC_APP_URL",
    value: "https://user:sentinel_do_not_log@example.invalid",
  },
]) {
  test(`next ${scenario.command} rejects invalid ${scenario.field} before serving`, () => {
    const result = spawnSync(process.execPath, [next, scenario.command], {
      env: { ...cleanEnvironment(), [scenario.field]: scenario.value },
      encoding: "utf8",
      timeout: 20000,
    });
    const output = result.stdout + result.stderr;
    assert.equal(result.status, 1, output);
    assert.match(output, /Invalid environment configuration/);
    assert.ok(!output.includes("sentinel_do_not_log"));
  });
}
