import { z } from 'zod';

export const serverMetaSchema = z.object({
  serverId: z.string().optional(),
});

export const viewValueSchema = z
  .looseObject({ value: z.string().nullish() })
  .catch({});

export const viewSelectedSchema = z
  .looseObject({
    selected_option: z
      .looseObject({
        value: z.string(),
      })
      .nullish(),
  })
  .catch({});

export const toolModeInputSchema = z
  .looseObject({
    selected_option: z
      .looseObject({
        value: z.enum(['allow', 'ask', 'block']),
      })
      .nullish(),
  })
  .catch({});

export const toolsMetaSchema = z.object({
  groups: z.record(z.string(), z.enum(['ro', 'dt', 'gn'])).optional(),
  nonce: z.string().optional(),
  serverId: z.string().optional(),
});

export function parseServerMeta({
  metadata,
}: {
  metadata: string;
}): z.output<typeof serverMetaSchema> {
  try {
    return serverMetaSchema.parse(JSON.parse(metadata || '{}'));
  } catch {
    return {};
  }
}

export function parseToolsMeta({
  metadata,
}: {
  metadata: string | undefined;
}): z.output<typeof toolsMetaSchema> {
  try {
    return toolsMetaSchema.parse(JSON.parse(metadata || '{}'));
  } catch {
    return {};
  }
}
