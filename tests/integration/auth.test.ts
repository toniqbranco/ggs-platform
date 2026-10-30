import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { cleanEnvironment } from "../helpers/environment";

test("SSR adapter persists PKCE/session cookies, propagates refresh cache headers, clears sign-out, and rejects revoked sessions", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--conditions=react-server",
      "--import",
      "tsx",
      "tests/fixtures/auth-gateway.ts",
    ],
    { env: cleanEnvironment(), encoding: "utf8", timeout: 20000 },
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /auth-cookie-refresh-revocation-pass/);
});
