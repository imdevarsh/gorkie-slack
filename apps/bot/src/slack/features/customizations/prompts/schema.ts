import { z } from 'zod';

const modalStateSchema = z.object({
  showPresets: z.boolean().default(false),
});

const promptValueSchema = z
  .looseObject({
    prompt_block: z
      .looseObject({
        prompt_input: z
          .looseObject({
            value: z.string().nullish(),
          })
          .optional(),
      })
      .optional(),
  })
  .catch({});

export function parseModalState({
  metadata,
}: {
  metadata?: string;
}): z.output<typeof modalStateSchema> {
  if (!metadata) {
    return modalStateSchema.parse({});
  }

  try {
    return modalStateSchema.parse(JSON.parse(metadata));
  } catch {
    return modalStateSchema.parse({});
  }
}

export function parsePromptValue({ values }: { values: unknown }): string {
  return (
    promptValueSchema.parse(values).prompt_block?.prompt_input?.value?.trim() ??
    ''
  );
}
