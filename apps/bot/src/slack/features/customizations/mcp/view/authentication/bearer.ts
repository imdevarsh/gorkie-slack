import { Blocks, Elements, Modal } from 'slack-block-builder';
import type { SlackModalDto } from 'slack-block-builder/dist/internal';
import { formatMCPError } from '@/lib/mcp/format-error';
import { codeBlock, mdText } from '@/slack/blocks';
import { blocks, inputs, views } from '../../ids';

export function bearerModal({
  error,
  serverId,
  serverName,
}: {
  error?: string;
  serverId: string;
  serverName: string;
}): SlackModalDto {
  const modal = Modal({
    callbackId: views.bearer,
    close: 'Cancel',
    privateMetaData: JSON.stringify({ serverId }),
    submit: 'Save',
    title: 'Connect MCP',
  });

  if (error) {
    modal.blocks(
      Blocks.Section({
        text: `*Could not connect — token not saved*\n${codeBlock({ value: formatMCPError(error), maxLength: 900 })}`,
      })
    );
  }

  modal.blocks(
    Blocks.Section({
      text: `*Connect ${mdText(serverName)} to Gorkie*\nEnter a bearer token for this MCP server.`,
    }),
    Blocks.Input({
      blockId: blocks.bearer,
      label: 'Token',
    }).element(
      Elements.TextInput({
        actionId: inputs.bearer,
        placeholder: 'Token',
      })
    )
  );

  return modal.buildToObject();
}
