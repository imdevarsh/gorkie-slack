import { asRecord } from '@repo/utils/record';
import { z } from 'zod';
import { blocks, inputs } from './ids';

type Field = keyof typeof blocks & keyof typeof inputs;
type SelectField = 'auth' | 'transport';
type ValueField = 'bearer' | 'clientId' | 'name' | 'url';

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

function fieldInput({ field, values }: { field: Field; values: unknown }) {
  const root = asRecord(values);
  const block = asRecord(root?.[blocks[field]]);
  return block?.[inputs[field]];
}

export function selectedFieldValue({
  field,
  values,
}: {
  field: SelectField;
  values: unknown;
}): string {
  return (
    viewSelectedSchema.parse(fieldInput({ field, values })).selected_option
      ?.value ?? ''
  );
}

export function textFieldValue({
  field,
  values,
}: {
  field: ValueField;
  values: unknown;
}): string {
  return (
    viewValueSchema.parse(fieldInput({ field, values })).value?.trim() ?? ''
  );
}

export const toolsMetaSchema = z.object({
  nonce: z.string().optional(),
  serverId: z.string().optional(),
  tools: z
    .record(
      z.string(),
      z.object({
        group: z.enum(['ro', 'dt', 'gn']),
        name: z.string(),
      })
    )
    .optional(),
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
