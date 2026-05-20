import { generateText } from 'ai';
import { getTopicSummaryConfig } from '~/db/queries/topic-summaries';
import { provider } from '~/lib/ai/providers';
import { redis } from '~/lib/kv';
import logger from '~/lib/logger';
import type { SlackMessageContext } from '~/types';
import { toLogError } from '~/utils/error';

const QUOTES_RE = /^['"](.*)['"]$/;

export async function processTopicSummaryHeuristic(
  context: SlackMessageContext
): Promise<void> {
  const channelId = context.event.channel;
  if (!channelId || context.event.channel_type === 'im') {
    return; // Do not run on DMs
  }

  try {
    // 1. Check if opted in
    const cacheKey = `channel:${channelId}:topic_summaries_enabled`;
    const cached = await redis.get(cacheKey);
    let enabled = false;

    if (cached === '1' || cached === '0') {
      enabled = cached === '1';
    } else {
      const config = await getTopicSummaryConfig(channelId);
      enabled = config?.enabled ?? false;
      await redis.set(cacheKey, enabled ? '1' : '0');
    }

    if (!enabled) {
      return;
    }

    // 2. Increment count
    const countKey = `channel:${channelId}:topic_summaries_count`;
    const count = await redis.incr(countKey);

    // 3. Heuristic
    if (count % 20 === 0) {
      // Run generation in the background
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
      'Error processing topic summary heuristic'
    );
  }
}

async function generateAndSetTopic(
  context: SlackMessageContext,
  channelId: string
): Promise<void> {
  // Fetch recent messages
  const history = await context.client.conversations.history({
    channel: channelId,
    limit: 30,
  });

  if (!history.messages || history.messages.length === 0) {
    return;
  }

  // Format conversation
  const transcript = history.messages
    .filter((m) => m.text && !m.bot_id) // ignore bot messages to get user topic
    .reverse() // chronologically
    .map((m) => `${m.user}: ${m.text}`)
    .join('\n');

  if (!transcript.trim()) {
    return;
  }

  // Generate topic
  const { text: generatedTopic } = await generateText({
    model: provider.languageModel('summariser-model'),
    prompt: `Analyze the following Slack conversation transcript and provide a very brief, 5-10 word topic summarizing what is currently being discussed. Output ONLY the topic string, no quotes, no extra text.\n\nTranscript:\n${transcript}`,
    maxOutputTokens: 20,
  });

  let topic = generatedTopic.trim().replace(QUOTES_RE, '$1');

  if (!topic) {
    return;
  }

  // Apply prefix/postfix
  const config = await getTopicSummaryConfig(channelId);

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
