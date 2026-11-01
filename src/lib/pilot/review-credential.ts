import "server-only";
import { spawn } from "node:child_process";
import path from "node:path";
import { z } from "zod";

export const reviewCredentialSchema = z
  .object({
    user: z.literal("ggs_pilot_review_login.rchxnmpsxfbsicthasxn"),
    password: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

export async function readReviewCredential(signal: AbortSignal) {
  if (
    process.platform !== "win32" ||
    process.env.APP_ENV !== "development" ||
    process.env.NODE_ENV === "production" ||
    signal.aborted
  )
    throw new Error("Private review unavailable.");
  // No shell, command interpolation, secret arguments, files, logging or env keys.
  return new Promise<z.infer<typeof reviewCredentialSchema>>(
    (resolve, reject) => {
      const child = spawn(
        "pwsh.exe",
        [
          "-NoLogo",
          "-NoProfile",
          "-NonInteractive",
          "-File",
          path.join(process.cwd(), "scripts/read-review-credential.ps1"),
          "-Acknowledgement",
          "ggs-local-owner-readonly-review",
        ],
        {
          shell: false,
          windowsHide: true,
          stdio: ["pipe", "pipe", "pipe"],
        },
      );
      let output = "",
        settled = false;
      const stop = () => {
        if (settled) return;
        settled = true;
        child.kill();
        cleanup();
        output = "";
        reject(new Error("Private review unavailable."));
      };
      const timer = setTimeout(stop, 10000);
      function cleanup() {
        clearTimeout(timer);
        signal.removeEventListener("abort", stop);
      }
      signal.addEventListener("abort", stop, { once: true });
      child.on("error", stop);
      child.stdin.on("error", stop);
      child.stdout.on("data", (chunk: Buffer) => {
        if (settled) return;
        output += chunk.toString("utf8");
        if (output.length > 2048) stop();
      });
      // Never forward child diagnostics; drain to avoid deadlock.
      child.stderr.on("data", () => {});
      child.on("close", (code) => {
        if (settled) return;
        try {
          if (code !== 0 || signal.aborted) throw new Error();
          const value = reviewCredentialSchema.parse(JSON.parse(output));
          settled = true;
          cleanup();
          output = "";
          resolve(value);
        } catch {
          stop();
        }
      });
      child.stdin.end("ggs-local-owner-readonly-review");
      if (signal.aborted) stop();
    },
  );
}
