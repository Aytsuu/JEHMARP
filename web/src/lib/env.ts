import { z } from "zod";

const publicEnvSchema = z.object({
  PUBLIC_SUPABASE_URL: z.url(),
  PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
});

const serverEnvSchema = publicEnvSchema
  .extend({
    SUPABASE_SECRET_KEY: z.string().min(1).optional(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  })
  .refine((value) => value.SUPABASE_SECRET_KEY ?? value.SUPABASE_SERVICE_ROLE_KEY, {
    message: "A Supabase server secret key is required",
  });

export type PublicEnv = {
  supabaseUrl: string;
  supabasePublishableKey: string;
};

export type ServerEnv = PublicEnv & {
  supabaseServerKey: string;
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

export function parseServerEnv(input: Record<string, unknown>): ServerEnv {
  const result = serverEnvSchema.safeParse(input);

  if (!result.success) {
    throw new Error("Invalid server environment configuration");
  }

  return {
    supabaseUrl: result.data.PUBLIC_SUPABASE_URL,
    supabasePublishableKey: result.data.PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    supabaseServerKey:
      result.data.SUPABASE_SECRET_KEY ?? result.data.SUPABASE_SERVICE_ROLE_KEY ?? "",
  };
}

export function getServerEnv(): ServerEnv {
  return parseServerEnv(getRuntimeServerEnv());
}

export function getRuntimeServerEnv(): Record<string, unknown> {
  return {
    ...import.meta.env,
    ...getProcessEnv(),
  };
}

function getProcessEnv(): Record<string, unknown> {
  if (typeof process === "undefined") {
    return {};
  }

  return process.env;
}
