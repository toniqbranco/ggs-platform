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
