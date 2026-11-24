import { z } from 'zod';

export const BlueprintSchema = z.object({
  name: z.string().min(3).max(100),
  slug: z
    .string()
    .min(3)
    .max(64)
    .regex(/^[a-z0-9-]+$/, 'Slug must contain lowercase letters, numbers, and hyphens only'),
  description: z.string().min(5).max(500),
  targetType: z.enum(['ecommerce_catalog', 'agency_kickoff']),
  sqlTableName: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[a-z_][a-z0-9_]*$/, 'Table name must be a valid lowercase SQL identifier'),
  schemaRules: z
    .array(
      z.object({
        key: z
          .string()
          .min(1)
          .max(64)
          .regex(/^[a-z_][a-z0-9_]*$/, 'Field key must be a valid lowercase SQL identifier'),
        label: z.string().min(1).max(80),
        type: z.enum(['string', 'number', 'currency', 'sku', 'email', 'gstin', 'url']),
        required: z.boolean(),
        aliases: z.array(z.string()),
      })
    )
    .min(1, 'At least one schema field rule is required'),
  mediaRules: z.object({
    minWidth: z.number().int().positive().max(8000),
    minHeight: z.number().int().positive().max(8000),
    targetWidth: z.number().int().positive().max(4096),
    targetHeight: z.number().int().positive().max(4096),
    aspectRatio: z.enum(['1:1', 'any']),
    outputFormat: z.enum(['webp', 'png']),
    deduplicateByHash: z.boolean(),
    autoHealOffRatio: z.boolean(),
  }),
});

export const UpdateBlueprintSchema = BlueprintSchema.omit({ slug: true }).partial();
