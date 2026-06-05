import { getMcpServerById } from '@repo/db/queries';
import { errorMessage } from '@repo/utils/error';
import { connectOAuthServer } from '@/lib/mcp/connection';
import { formatMCPError } from '@/lib/mcp/format-error';
import { codeBlock } from '@/slack/blocks';
import { publishHome } from '../../publish';
import { actions } from '../ids';
import type { ButtonArgs } from '../types';
import { oauthModal, statusModal } from '../view';

export const name = actions.connectOAuth;

const updateView = (
  client: ButtonArgs['client'],
  viewId: string,
  view: ReturnType<typeof statusModal>
) => client.views.update({ view_id: viewId, view }).catch(() => undefined);

export async function execute({
  ack,
  action,
  body,
  client,
}: ButtonArgs): Promise<void> {
  await ack();
  if (!action.value) {
    return;
  }

  const opened = await client.views.open({
    trigger_id: body.trigger_id,
    view: statusModal({ title: 'Connect MCP', text: 'Preparing connection…' }),
  });
  const viewId = opened.view?.id;
  if (!viewId) {
    return;
  }

  const server = await getMcpServerById({
    id: action.value,
    userId: body.user.id,
  });
  if (!server || server.authType !== 'oauth') {
    await updateView(
      client,
      viewId,
      statusModal({
        title: 'Connect MCP',
        text: 'Could not find this MCP server.',
      })
    );
    return;
  }

  try {
    const result = await connectOAuthServer({
      server,
      teamId: body.team?.id,
      userId: body.user.id,
    });

    if (result.status === 'authorize') {
      await client.views
        .update({
          view_id: viewId,
          view: oauthModal({
            authorizationUrl: result.authorizationUrl,
            serverId: server.id,
            serverName: server.name,
          }),
        })
        .catch(() => undefined);
      return;
    }

    await publishHome({ client, userId: body.user.id });
    await updateView(
      client,
      viewId,
      statusModal({
        title: 'Connect MCP',
        text: 'This MCP server is connected. You can close this modal.',
      })
    );
  } catch (error) {
    await publishHome({ client, userId: body.user.id });
    await updateView(
      client,
      viewId,
      statusModal({
        title: 'Connection Failed',
        text: `Could not connect:\n${codeBlock({ value: formatMCPError(errorMessage(error)), maxLength: 900 })}`,
      })
    );
  }
}
