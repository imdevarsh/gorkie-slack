import { asRecord } from '@repo/utils/record';

export interface ModalState {
  showPresets: boolean;
}

export function parseModalState({
  metadata,
}: {
  metadata?: string;
}): ModalState {
  try {
    const parsed = asRecord(JSON.parse(metadata ?? '{}'));
    return { showPresets: parsed?.showPresets === true };
  } catch {
    return { showPresets: false };
  }
}

export function parsePromptValue({ values }: { values: unknown }): string {
  const root = asRecord(values);
  const block = asRecord(root?.prompt_block);
  const input = asRecord(block?.prompt_input);
  return typeof input?.value === 'string' ? input.value.trim() : '';
}
