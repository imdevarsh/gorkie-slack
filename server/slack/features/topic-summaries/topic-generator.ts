import { generateText } from 'ai';
import { getConfig } from '~/db/queries/topic-summaries';
import { provider } from '~/lib/ai/providers';
import {
  getCachedEnabled,
  incrementMessageCount,
  setCachedEnabled,
} from '~/lib/kv/queries/topic-summaries';
import logger from '~/lib/logger';
import type { SlackMessageContext } from '~/types';
import { toLogError } from '~/utils/error';

const QUOTES_RE = /^['"](.*)['"]$/;

export async function runTopicHeuristic(
  context: SlackMessageContext
): Promise<void> {
  const channelId = context.event.channel;
  if (!channelId || context.event.channel_type === 'im') {
    return;
  }

  try {
    const cached = await getCachedEnabled(channelId);
    let enabled: boolean;

    if (cached !== null) {
      enabled = cached;
    } else {
      const config = await getConfig(channelId);
      enabled = config?.enabled ?? false;
      await setCachedEnabled(channelId, enabled);
    }

    if (!enabled) {
      return;
    }

    const count = await incrementMessageCount(channelId);

    if (count % 20 === 0) {
      generateAndSetTopic(context, channelId).catch((error) => {
        logger.error(
          { ...toLogError(error), channelId },
          'Failed to generate and set topic summary'
        );
      });
    }
  } catch (error) {
    logger.error(
      { ...toLogError(error), channelId },
      'Error running topic heuristic'
    );
  }
}

async function generateAndSetTopic(
  context: SlackMessageContext,
  channelId: string
): Promise<void> {
  const history = await context.client.conversations.history({
    channel: channelId,
    limit: 30,
  });

  if (!history.messages || history.messages.length === 0) {
    return;
  }

  const transcript = history.messages
    .filter((m) => m.text && !m.bot_id)
    .reverse()
    .map((m) => `${m.user}: ${m.text}`)
    .join('\n');

  if (!transcript.trim()) {
    return;
  }

  const { text: generatedTopic } = await generateText({
    model: provider.languageModel('summariser-model'),
    prompt: `Analyze the following Slack conversation transcript and provide a very brief, 5-10 word topic summarizing what is currently being discussed. Output ONLY the topic string, no quotes, no extra text.\n\nTranscript:\n${transcript}`,
    maxOutputTokens: 20,
  });

  let topic = generatedTopic.trim().replace(QUOTES_RE, '$1');

  if (!topic) {
    return;
  }

  const config = await getConfig(channelId);

  if (config?.prefix) {
    topic = `${config.prefix} ${topic}`;
  }
  if (config?.postfix) {
    topic = `${topic} ${config.postfix}`;
  }

  await context.client.conversations.setTopic({
    channel: channelId,
    topic,
  });

  logger.info({ channelId, topic }, 'Automatically updated channel topic');
}
