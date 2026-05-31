import { createMcpServer } from '@repo/db/queries';
import type {
  AllMiddlewareArgs,
  SlackViewMiddlewareArgs,
  ViewSubmitAction,
} from '@slack/bolt';
import { validateHttpsUrlForServer } from '@/lib/mcp/guarded-fetch';
import { publishHome } from '../../publish';

export const name = 'home_mcp_save';

export async function execute({
  ack,
  body,
  client,
  view,
}: SlackViewMiddlewareArgs<ViewSubmitAction> &
  AllMiddlewareArgs): Promise<void> {
  const nameValue =
    view.state.values.name_block?.name_input?.value?.trim() ?? '';
  const urlValue = view.state.values.url_block?.url_input?.value?.trim() ?? '';
  const transportValue =
    view.state.values.transport_block?.transport_input?.selected_option
      ?.value ?? 'http';

  const errors: Record<string, string> = {};
  if (!nameValue) {
    errors.name_block = 'Enter a name.';
  }
  if (!(transportValue === 'http' || transportValue === 'sse')) {
    errors.transport_block = 'Transport must be http or sse.';
  }

  let safeUrl = '';
  try {
    safeUrl = await validateHttpsUrlForServer(urlValue);
  } catch (error) {
    errors.url_block =
      error instanceof Error ? error.message : 'Enter a valid HTTPS URL.';
  }

  if (Object.keys(errors).length > 0) {
    await ack({ errors, response_action: 'errors' });
    return;
  }

  await ack();
  await createMcpServer({
    enabled: false,
    name: nameValue,
    teamId: body.team?.id ?? null,
    transport: transportValue,
    url: safeUrl,
    userId: body.user.id,
  });
  await publishHome(client, body.user.id);
}
