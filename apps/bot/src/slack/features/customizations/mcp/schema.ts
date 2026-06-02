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

export function parsePrivateMetadata({
  metadata,
}: {
  metadata: string;
}): unknown {
  try {
    return JSON.parse(metadata || '{}');
  } catch {
    return {};
  }
}
