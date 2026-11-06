import { z } from "zod";
export const localSetupViewSchema = z
  .object({ stage: z.enum(["password", "profile", "review", "complete"]) })
  .strict();
export type LocalSetupView = z.infer<typeof localSetupViewSchema>;
export type LocalSetupAction =
  "start" | "status" | "password" | "password-receipt" | "profile" | "finalize";
