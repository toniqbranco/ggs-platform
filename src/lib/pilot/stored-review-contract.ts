import { z } from "zod";

export const reviewRequestSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("list") }).strict(),
  z
    .object({ operation: z.literal("history"), applicationId: z.uuid() })
    .strict(),
]);
export type ReviewRequest = z.infer<typeof reviewRequestSchema>;
const date = z.union([
  z.date().transform((value) => value.toISOString()),
  z.iso.datetime({ offset: true }),
]);
export const storedApplicationSchema = z.object({
  id: z.uuid(),
  name: z.string().min(2).max(80),
  email: z.email(),
  country: z.string().max(80),
  platform: z.enum(["tiktok", "twitch", "youtube", "other"]),
  profile: z.url().refine((value) => {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  }),
  locale: z.enum(["es", "en"]),
  state: z.enum(["pending", "approved", "rejected", "withdrawn"]),
  revision: z.number().int().min(1).max(2),
  createdAt: date,
});
export const storedEventSchema = z.object({
  kind: z.enum(["submitted", "approved", "rejected", "withdrawn"]),
  revision: z.number().int().min(1).max(2),
  occurredAt: date,
});
export type StoredApplication = z.infer<typeof storedApplicationSchema>;
export type StoredEvent = z.infer<typeof storedEventSchema>;
export const storedReviewDataSchema = z.union([
  z.object({
    applications: z.array(storedApplicationSchema).max(50),
    bounded: z.literal(true),
  }),
  z.object({ events: z.array(storedEventSchema).max(2) }),
]);
