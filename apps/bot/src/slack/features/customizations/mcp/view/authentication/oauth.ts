import { Blocks, Elements, Modal } from 'slack-block-builder';
import type { SlackModalDto } from 'slack-block-builder/dist/internal';
import { mdText } from '@/slack/blocks';
import { views } from '../../ids';

export function oauthModal({
  authorizationUrl,
  serverId,
  serverName,
}: {
  authorizationUrl: string;
  serverId: string;
  serverName: string;
}): SlackModalDto {
  return Modal({
    callbackId: views.oauth,
    close: 'Done',
    privateMetaData: JSON.stringify({ serverId }),
    title: 'Connect MCP',
  })
    .notifyOnClose()
    .blocks(
      Blocks.Section({
        text: `*Connect ${mdText(serverName)} to Gorkie*\n\nAuthenticate with this MCP server, then return to Slack.`,
      }),
      Blocks.Actions().elements(
        Elements.Button({
          text: 'Authenticate',
          url: authorizationUrl,
        })
      )
    )
    .buildToObject();
}
