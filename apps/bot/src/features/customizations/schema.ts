import { z } from 'zod';

const modalStateSchema = z
  .object({
    showPresets: z.boolean().default(false),
  })
  .catch({ showPresets: false });

const slackInputValuesSchema = z.record(
  z.string(),
  z.record(
    z.string(),
    z.looseObject({ value: z.string().nullable().optional() })
  )
);

export const openedViewSchema = z.object({
  hash: z.string(),
  id: z.string(),
});

export const slackActionViewSchema = z.object({
  view: z.object({
    hash: z.string(),
    id: z.string(),
    private_metadata: z.string().optional(),
    state: z.looseObject({ values: z.unknown().optional() }).optional(),
  }),
});

export function parseModalState({
  metadata,
}: {
  metadata?: string;
}): z.output<typeof modalStateSchema> {
  if (!metadata) {
    return { showPresets: false };
  }

  try {
    return modalStateSchema.parse(JSON.parse(metadata));
  } catch {
    return { showPresets: false };
  }
}

export function promptFromViewValues({
  values,
}: {
  values: unknown;
}): string | null {
  const parsed = slackInputValuesSchema.safeParse(values);
  if (!parsed.success) {
    return null;
  }

  const input = parsed.data.customization_prompt?.prompt;
  return typeof input?.value === 'string' ? input.value.trim() : null;
}
