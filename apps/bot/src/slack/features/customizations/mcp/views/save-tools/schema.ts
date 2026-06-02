import { z } from 'zod';
import { inputs } from '../../ids';
import { parsePrivateMetadata, serverMetaSchema } from '../../schema';
import type { SubmitArgs } from '../../types';

const toolModeSchema = z
  .looseObject({
    selected_option: z
      .looseObject({
        value: z.enum(['allow', 'ask', 'block']),
      })
      .nullish(),
  })
  .catch({});

export function parseSaveToolsPayload({ view }: { view: SubmitArgs['view'] }): {
  modes: Array<{ mode: 'allow' | 'ask' | 'block'; permissionId: string }>;
  serverId: string | null;
} {
  const meta = serverMetaSchema.safeParse(
    parsePrivateMetadata({ metadata: view.private_metadata })
  );
  const modes = Object.entries(view.state.values).flatMap(
    ([blockId, fields]) => {
      if (!blockId.startsWith('tool_')) {
        return [];
      }
      const selected = toolModeSchema.parse(
        fields[inputs.toolMode]
      ).selected_option;
      return selected?.value
        ? [
            {
              mode: selected.value,
              permissionId: blockId.slice('tool_'.length),
            },
          ]
        : [];
    }
  );

  return {
    modes,
    serverId: meta.success ? (meta.data.serverId ?? null) : null,
  };
}
