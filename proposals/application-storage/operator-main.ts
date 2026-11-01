// Private child-process entry point. Never imported by app/startup.
import { z } from "zod";
import { createSupabaseOperator } from "./operator-adapter";
async function main() {
  let text = "";
  for await (const chunk of process.stdin) {
    text += String(chunk);
    if (Buffer.byteLength(text, "utf8") > 32768) throw new Error();
  }
  const input = z
    .object({
      appEnv: z.literal("development"),
      acknowledgement: z.literal("reviewed-gg-livestream-testing-provisioning"),
      accessToken: z.string(),
      action: z.enum(["preflight", "prepare", "enable", "verify", "disable"]),
      operationId: z.uuid(),
      bundle: z.unknown().optional(),
    })
    .strict()
    .parse(JSON.parse(text));
  const operator = createSupabaseOperator({
    appEnv: input.appEnv,
    acknowledgement: input.acknowledgement,
    accessToken: input.accessToken,
  });
  const result = await operator.run(
    input.action,
    input.operationId,
    input.bundle,
  );
  // Typed safe receipts only; no SQL, verifiers, tokens or raw errors.
  process.stdout.write(JSON.stringify(result));
}
main().catch(() => {
  process.stderr.write("GG testing operator unavailable.\n");
  process.exitCode = 1;
});
