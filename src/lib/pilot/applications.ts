import { z } from "zod";

export const platforms = ["tiktok", "twitch", "youtube", "other"] as const;
export const applicationSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    email: z.email().max(254),
    country: z.string().trim().min(2).max(80),
    platform: z.enum(platforms),
    profile: z
      .url()
      .max(300)
      .refine((value) => {
        const url = new URL(value);
        return url.protocol === "https:" && !url.username && !url.password;
      }),
  })
  .strict();

export type ApplicationFields = z.infer<typeof applicationSchema>;
export type ReviewState = "pending" | "approved" | "rejected";
export type PreviewApplication = ApplicationFields & {
  id: string;
  state: ReviewState;
};

// A local rehearsal only. Approval and invitation are deliberately separate.
export function previewDecision(
  state: ReviewState,
  decision: "approved" | "rejected",
): ReviewState {
  return state === "pending" ? decision : state;
}
