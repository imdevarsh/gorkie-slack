import { asRecord } from '@repo/utils/record';
import {
  type MCPModalState,
  type MCPServerMeta,
  type MCPToolsMeta,
  mcpModalStateSchema,
  mcpServerMetaSchema,
  mcpSlackViewSelectedSchema,
  mcpSlackViewValueSchema,
  mcpToolsMetaSchema,
} from '@repo/validators';
import { blocks, inputs } from './ids';

type Field = keyof typeof blocks & keyof typeof inputs;
type SelectField = 'auth' | 'transport';
type ValueField = 'bearer' | 'clientId' | 'name' | 'url';

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
    mcpSlackViewSelectedSchema.parse(fieldInput({ field, values }))
      .selected_option?.value ?? ''
  );
}

export function textFieldValue({
  field,
  values,
}: {
  field: ValueField;
  values: unknown;
}): string {
  return textFieldState({ field, values }) ?? '';
}

export function textFieldState({
  field,
  values,
}: {
  field: ValueField;
  values: unknown;
}): string | undefined {
  const value = mcpSlackViewValueSchema.parse(
    fieldInput({ field, values })
  ).value;
  return typeof value === 'string' ? value.trim() : undefined;
}

export function parseServerMeta({
  metadata,
}: {
  metadata: string;
}): MCPServerMeta {
  try {
    return mcpServerMetaSchema.parse(JSON.parse(metadata || '{}'));
  } catch {
    return {};
  }
}

export function parseModalState({
  metadata,
}: {
  metadata?: string;
}): MCPModalState {
  try {
    return mcpModalStateSchema.parse(JSON.parse(metadata || '{}'));
  } catch {
    return {};
  }
}

export function parseToolsMeta({
  metadata,
}: {
  metadata: string | undefined;
}): MCPToolsMeta {
  try {
    return mcpToolsMetaSchema.parse(JSON.parse(metadata || '{}'));
  } catch {
    return {};
  }
}
