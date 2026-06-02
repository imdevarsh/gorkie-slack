import { blocks, inputs } from '../../ids';
import {
  parsePrivateMetadata,
  serverMetaSchema,
  viewValueSchema,
} from '../../schema';
import type { SubmitArgs } from '../../types';

export function parseSaveBearerPayload({ view }: { view: SubmitArgs['view'] }):
  | {
      data: {
        bearerToken: string;
        serverId: string;
      };
      errors: Record<string, never>;
    }
  | { data: null; errors: Record<string, string> } {
  const bearerToken =
    viewValueSchema
      .parse(view.state.values[blocks.bearer]?.[inputs.bearer])
      .value?.trim() ?? '';
  if (!bearerToken) {
    return {
      data: null,
      errors: { [blocks.bearer]: 'Enter a bearer token.' },
    };
  }

  const meta = serverMetaSchema.safeParse(
    parsePrivateMetadata({ metadata: view.private_metadata })
  );
  if (!(meta.success && meta.data.serverId)) {
    return {
      data: null,
      errors: { [blocks.bearer]: 'Could not identify this MCP server.' },
    };
  }

  return {
    data: { bearerToken, serverId: meta.data.serverId },
    errors: {},
  };
}
