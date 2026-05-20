import type {
  AllMiddlewareArgs,
  SlackCommandMiddlewareArgs,
} from '@slack/bolt';
import {
  getTopicSummaryEnabled,
  upsertTopicSummaryEnabled,
} from '~/db/queries/topic-summaries';
import { redis } from '~/lib/kv';

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
  ],
};

export async function execute({
  ack,
  command,
  respond,
}: SlackCommandMiddlewareArgs & AllMiddlewareArgs) {
  await ack();
  const channelId = command.channel_id;
  const action = command.text?.trim().toLowerCase();

  if (action === 'enable' || action === 'disable') {
    const enabled = action === 'enable';

    // 1. Upsert Postgres
    await upsertTopicSummaryEnabled(channelId, enabled);

    // 2. Update Redis Cache
    await redis.set(
      `channel:${channelId}:topic_summaries_enabled`,
      enabled ? '1' : '0'
    );

    await respond({
      text: `Auto-topic summaries have been *${enabled ? 'enabled' : 'disabled'}* for this channel.`,
      response_type: 'ephemeral',
    });
    return;
  }

  if (action === 'status' || action === '') {
    // Check Redis first
    const cached = await redis.get(
      `channel:${channelId}:topic_summaries_enabled`
    );
    let enabled = false;

    if (cached === '1' || cached === '0') {
      enabled = cached === '1';
    } else {
      // Fallback to DB
      enabled = await getTopicSummaryEnabled(channelId);
      await redis.set(
        `channel:${channelId}:topic_summaries_enabled`,
        enabled ? '1' : '0'
      );
    }

    await respond({
      text: `Auto-topic summaries are currently *${enabled ? 'enabled' : 'disabled'}* for this channel.`,
      response_type: 'ephemeral',
    });
    return;
  }

  await respond({
    text: `Invalid action. Usage: \`${command.command} topic-summaries <enable|disable|status>\``,
    response_type: 'ephemeral',
  });
}
