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
