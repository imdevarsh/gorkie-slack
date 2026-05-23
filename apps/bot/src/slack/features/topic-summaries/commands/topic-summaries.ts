import type {
  AllMiddlewareArgs,
  SlackCommandMiddlewareArgs,
} from '@slack/bolt';
import {
  getConfig,
  upsertEnabled,
  upsertPostfix,
  upsertPrefix,
} from '@repo/db/queries/topic-summaries';
import {
  getCachedEnabled,
  setCachedEnabled,
} from '@repo/kv/queries/topic-summaries';

export const name = 'topic-summaries';

export const help = {
  name: 'topic-summaries',
  description: 'Manage auto-topic synchronization for the current channel.',
  subcommands: [
    {
      usage: 'topic-summaries enable',
      description: 'Enable auto-topic summaries.',
    },
    {
      usage: 'topic-summaries disable',
      description: 'Disable auto-topic summaries.',
    },
    {
      usage: 'topic-summaries status',
      description: 'Check if auto-topic summaries are enabled.',
    },
    {
      usage: 'topic-summaries prefix <text>',
      description:
        'Set a prefix for the generated topic (or leave blank to clear).',
    },
    {
      usage: 'topic-summaries postfix <text>',
      description:
        'Set a postfix for the generated topic (or leave blank to clear).',
    },
  ],
};

export async function execute({
  ack,
  command,
  respond,
}: SlackCommandMiddlewareArgs & AllMiddlewareArgs) {
  await ack();
  const channelId = command.channel_id;
  const rawText = command.text?.trim() || '';
  const parts = rawText.split(' ');
  const action = parts[0]?.toLowerCase();

  if (action === 'enable' || action === 'disable') {
    const enabled = action === 'enable';

    await upsertEnabled(channelId, enabled);
    await setCachedEnabled(channelId, enabled);

    await respond({
      text: `Auto-topic summaries have been *${enabled ? 'enabled' : 'disabled'}* for this channel.`,
      response_type: 'ephemeral',
    });
    return;
  }

  if (action === 'prefix' || action === 'postfix') {
    const value = parts.slice(1).join(' ') || null;

    if (action === 'prefix') {
      await upsertPrefix(channelId, value);
    } else {
      await upsertPostfix(channelId, value);
    }

    const typeName = action === 'prefix' ? 'Prefix' : 'Postfix';
    const msg = value
      ? `${typeName} set to: \`${value}\``
      : `${typeName} cleared.`;

    await respond({
      text: msg,
      response_type: 'ephemeral',
    });
    return;
  }

  if (action === 'status' || action === '') {
    const config = await getConfig(channelId);

    await setCachedEnabled(channelId, config.enabled);

    let statusText = `Auto-topic summaries are currently *${config.enabled ? 'enabled' : 'disabled'}* for this channel.`;
    if (config.prefix) {
      statusText += `\n*Prefix:* \`${config.prefix}\``;
    }
    if (config.postfix) {
      statusText += `\n*Postfix:* \`${config.postfix}\``;
    }

    await respond({
      text: statusText,
      response_type: 'ephemeral',
    });
    return;
  }

  await respond({
    text: `Invalid action. Usage: \`${command.command} topic-summaries <enable|disable|status|prefix|postfix>\``,
    response_type: 'ephemeral',
  });
}
