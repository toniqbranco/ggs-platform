import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { cleanEnvironment } from "../helpers/environment";

test("server factory fails before request context and makes no fetch calls", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--conditions=react-server",
      "--import",
      "tsx",
      "tests/fixtures/server-factory.ts",
    ],
    { env: cleanEnvironment(), encoding: "utf8", timeout: 20000 },
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /server-factory-disconnected/);
});

for (const boundary of [
  {
    name: "local-setup-fixture-server-only",
    conditions: [],
    file: "./proposals/streamer-onboarding/local-app-fixture.ts",
    message: /cannot be imported from a Client Component/i,
  },
  {
    name: "setup-wire-fixture-server-only",
    conditions: [],
    file: "./proposals/streamer-onboarding/wire-fixture.ts",
    message: /cannot be imported from a Client Component/i,
  },
  {
    name: "onboarding-owner-recovery-server-only",
    conditions: [],
    file: "./proposals/streamer-onboarding/owner-recovery.ts",
    message: /cannot be imported from a Client Component/i,
  },
  {
    name: "onboarding-operation-store-server-only",
    conditions: [],
    file: "./proposals/streamer-onboarding/operation-store.ts",
    message: /cannot be imported from a Client Component/i,
  },
  {
    name: "onboarding-fixture-gateway-server-only",
    conditions: [],
    file: "./proposals/streamer-onboarding/fixture-gateway.ts",
    message: /cannot be imported from a Client Component/i,
  },
  {
    name: "onboarding-http-fixture-server-only",
    conditions: [],
    file: "./proposals/streamer-onboarding/http-fixture.ts",
    message: /cannot be imported from a Client Component/i,
  },
  {
    name: "onboarding-adapter-server-only",
    conditions: [],
    file: "./proposals/streamer-onboarding/adapter.ts",
    message: /cannot be imported from a Client Component/i,
  },
  {
    name: "owner-review-database-server-only",
    conditions: [],
    file: "./src/lib/pilot/review-database.ts",
    message: /cannot be imported from a Client Component/i,
  },
  {
    name: "owner-review-credential-server-only",
    conditions: [],
    file: "./src/lib/pilot/review-credential.ts",
    message: /cannot be imported from a Client Component/i,
  },
  {
    name: "storage-operator-server-only",
    conditions: [],
    file: "./proposals/application-storage/operator-adapter.ts",
    message: /cannot be imported from a Client Component/i,
  },
  {
    name: "storage-transport-server-only",
    conditions: [],
    file: "./proposals/application-storage/transport.ts",
    message: /cannot be imported from a Client Component/i,
  },
  {
    name: "storage-proposal-server-only",
    conditions: [],
    file: "./proposals/application-storage/adapter.ts",
    message: /cannot be imported from a Client Component/i,
  },
  {
    name: "server-only",
    conditions: [],
    file: "./src/lib/env/server.ts",
    message: /cannot be imported from a Client Component/i,
  },
  {
    name: "client-only",
    conditions: ["--conditions=react-server"],
    file: "./src/lib/supabase/client.ts",
    message: /cannot be imported from a Server Component/i,
  },
]) {
  test(`${boundary.name} rejects an import in the wrong runtime`, () => {
    const code = `import(${JSON.stringify(boundary.file)}).catch(error=>{console.log(error.message);process.exit(9);})`;
    const result = spawnSync(
      process.execPath,
      [...boundary.conditions, "--import", "tsx", "-e", code],
      { env: cleanEnvironment(), encoding: "utf8", timeout: 20000 },
    );
    assert.equal(result.status, 9, result.stdout + result.stderr);
    assert.match(result.stdout, boundary.message);
  });
}
