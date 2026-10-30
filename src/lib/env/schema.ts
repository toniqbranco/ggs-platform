import { z } from "zod";

function normalize(value: unknown) {
  return typeof value === "string" ? value.trim() || undefined : value;
}

function isSafeHttpUrl(value: string) {
  try {
    const url = new URL(value);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    return (
      (url.protocol === "https:" || (local && url.protocol === "http:")) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      url.pathname === "/"
    );
  } catch {
    return false;
  }
}

const origin = z.string().refine(isSafeHttpUrl, {
  message:
    "Use an HTTPS origin, or HTTP on localhost, without credentials, paths, queries, or fragments.",
});
const forbidden = z.preprocess(
  normalize,
  z.undefined({
    error:
      "This key is not supported in WP-01. Do not provide privileged or legacy keys.",
  }),
);

const publicShape = {
  NEXT_PUBLIC_APP_URL: z.preprocess(
    normalize,
    origin.default("http://localhost:3000"),
  ),
  NEXT_PUBLIC_SUPABASE_ENABLED: z
    .preprocess(
      normalize,
      z
        .literal("false", {
          error: "Supabase must remain disabled (false) throughout WP-01.",
        })
        .default("false"),
    )
    .transform(() => false as const),
  NEXT_PUBLIC_SUPABASE_URL: z.preprocess(normalize, origin.optional()),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.preprocess(
    normalize,
    z
      .string()
      .regex(/^sb_publishable_[A-Za-z0-9_-]+$/, {
        message:
          "Use a publishable key with the sb_publishable_ prefix, or leave both Supabase fields empty.",
      })
      .optional(),
  ),
};

function hasConfigPair(value: {
  NEXT_PUBLIC_SUPABASE_URL?: string | undefined;
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string | undefined;
}) {
  return (
    Boolean(value.NEXT_PUBLIC_SUPABASE_URL) ===
    Boolean(value.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
  );
}

const pairError = {
  message:
    "Provide both Supabase URL and publishable key, or leave both empty. Connections remain disabled.",
  path: ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"],
};

const publicSchema = z.object(publicShape).refine(hasConfigPair, pairError);
const serverSchema = z
  .object({
    ...publicShape,
    APP_ENV: z.preprocess(
      normalize,
      z
        .enum(["development", "test", "staging", "production"], {
          error: "Choose development, test, staging, or production.",
        })
        .default("development"),
    ),
    SUPABASE_SERVICE_ROLE_KEY: forbidden,
    SUPABASE_SECRET_KEY: forbidden,
    NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY: forbidden,
    NEXT_PUBLIC_SUPABASE_SECRET_KEY: forbidden,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: forbidden,
  })
  .refine(hasConfigPair, pairError);

export type PublicEnvironment = z.infer<typeof publicSchema>;
export type ServerEnvironment = z.infer<typeof serverSchema>;

export class EnvironmentValidationError extends Error {
  constructor(issues: z.core.$ZodIssue[]) {
    // Report only field names and controlled messages, never supplied values.
    super(
      "Invalid environment configuration:\n" +
        issues
          .map((issue) => `- ${issue.path.join(".")}: ${issue.message}`)
          .join("\n"),
    );
    this.name = "EnvironmentValidationError";
  }
}

export function parsePublicEnvironment(input: unknown): PublicEnvironment {
  const result = publicSchema.safeParse(input);
  if (!result.success)
    throw new EnvironmentValidationError(result.error.issues);
  return result.data;
}

export function parseServerEnvironment(input: unknown): ServerEnvironment {
  const result = serverSchema.safeParse(input);
  if (!result.success)
    throw new EnvironmentValidationError(result.error.issues);
  return result.data;
}
