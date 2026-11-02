import assert from "node:assert/strict";
import { mock, test } from "node:test";
import {
  authOutcome,
  hasBrowserVerifier,
  recordAuthDiagnostic,
} from "../../src/lib/auth/diagnostics";
import { pilotAuthCookieName } from "../../src/lib/auth/config";
test("diagnostics distinguish verifier cookies from removed values and flow indexes", () => {
  assert.equal(
    hasBrowserVerifier([
      {
        name: `${pilotAuthCookieName}-code-verifier`,
        value: "synthetic-private",
      },
    ]),
    true,
  );
  assert.equal(
    hasBrowserVerifier([
      {
        name: `${pilotAuthCookieName}-flow-abcdefgh-code-verifier`,
        value: "synthetic-private",
      },
    ]),
    true,
  );
  for (const cookie of [
    { name: `${pilotAuthCookieName}-code-verifier`, value: "" },
    {
      name: `${pilotAuthCookieName}-code-verifier`,
      value: "synthetic",
      maxAge: 0,
    },
    { name: `${pilotAuthCookieName}-flows-code-verifier`, value: "synthetic" },
  ])
    assert.equal(hasBrowserVerifier([cookie]), false);
});
test("local diagnostics contain only controlled labels and booleans and stay off outside development", () => {
  const env: Record<string, string | undefined> = process.env,
    prior = env.APP_ENV,
    priorNode = env.NODE_ENV;
  const calls: unknown[][] = [];
  mock.method(console, "info", (...args: unknown[]) => {
    calls.push(args);
  });
  try {
    env.APP_ENV = "development";
    env.NODE_ENV = "development";
    for (const error of [
      null,
      {
        code: "over_email_send_rate_limit",
        message: "sensitive@example.invalid",
      },
      { code: "pkce_code_verifier_not_found", secret: "must-not-log" },
      { message: "must-not-log" },
    ])
      recordAuthDiagnostic("request", false, authOutcome(error));
    assert.deepEqual(
      calls.map((args) => (args[1] as { outcome: string }).outcome),
      ["accepted", "rate-limited", "missing-verifier", "unavailable"],
    );
    assert.ok(!JSON.stringify(calls).includes("must-not-log"));
    assert.ok(!JSON.stringify(calls).includes("sensitive@example.invalid"));
    env.APP_ENV = "test";
    recordAuthDiagnostic("callback", true, "accepted");
    env.APP_ENV = "development";
    env.NODE_ENV = "production";
    recordAuthDiagnostic("callback", true, "accepted");
    assert.equal(calls.length, 4);
  } finally {
    mock.restoreAll();
    if (prior === undefined) delete env.APP_ENV;
    else env.APP_ENV = prior;
    if (priorNode === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = priorNode;
  }
});
