import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  PORT: z
    .string()
    .regex(/^\d+$/, 'PORT must be a valid integer port number')
    .default('3000'),
  HOSTNAME: z
    .string()
    .default('0.0.0.0'),
  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL cannot be empty if provided')
    .optional(),
  DATABASE_SSL: z
    .enum(['true', 'false'])
    .default('false'),
  GEMINI_API_KEY: z
    .string()
    .min(1, 'GEMINI_API_KEY cannot be empty if provided')
    .optional(),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Pure validator function for environment variables.
 * Allows safe verification in unit test suites with custom payloads.
 */
export function validateEnv(
  source: Record<string, string | undefined> = process.env
): {
  success: boolean;
  data?: Env;
  errors?: z.ZodFormattedError<Env>;
} {
  const result = envSchema.safeParse(source);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    errors: result.error.format(),
  };
}

/**
 * Validates process.env at runtime.
 * Logs structured diagnostic errors if invalid.
 */
function parseRuntimeEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    if (process.env.NODE_ENV !== 'test') {
      console.error(
        '❌ Invalid environment configuration:',
        JSON.stringify(parsed.error.format(), null, 2)
      );
    }
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        `Invalid environment variables: ${JSON.stringify(parsed.error.flatten().fieldErrors)}`
      );
    }
    return envSchema.parse({
      NODE_ENV: process.env.NODE_ENV || 'development',
      PORT: process.env.PORT || '3000',
      HOSTNAME: process.env.HOSTNAME || '0.0.0.0',
      DATABASE_URL: process.env.DATABASE_URL,
      DATABASE_SSL: process.env.DATABASE_SSL || 'false',
      GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    });
  }
  return parsed.data;
}

export const env: Env = parseRuntimeEnv();
