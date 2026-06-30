import { z } from "zod";

const publicEnvSchema = z.object({
  PUBLIC_SUPABASE_URL: z.url(),
  PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
});

export type PublicEnv = {
  supabaseUrl: string;
  supabasePublishableKey: string;
};

export function parsePublicEnv(input: Record<string, unknown>): PublicEnv {
  const result = publicEnvSchema.safeParse(input);

  if (!result.success) {
    throw new Error("Invalid public environment configuration");
  }

  return {
    supabaseUrl: result.data.PUBLIC_SUPABASE_URL,
    supabasePublishableKey: result.data.PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  };
}

export function getPublicEnv(): PublicEnv {
  return parsePublicEnv(import.meta.env);
}
