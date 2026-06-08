import { asRecord } from '@repo/utils/record';
import { z } from 'zod';

const modalStateSchema = z
  .object({
    showPresets: z.boolean().default(false),
  })
  .catch({ showPresets: false });

export type ModalState = z.output<typeof modalStateSchema>;

export function parseModalState({
  metadata,
}: {
  metadata?: string;
}): ModalState {
  try {
    return modalStateSchema.parse(JSON.parse(metadata ?? '{}'));
  } catch {
    return { showPresets: false };
  }
}

export function parsePromptValue({
  values,
}: {
  values: unknown;
}): string | null {
  const root = asRecord(values);
  const block = asRecord(root?.prompt_block);
  const input = asRecord(block?.prompt_input);
  return typeof input?.value === 'string' ? input.value.trim() : null;
}
