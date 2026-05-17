import { generateText } from 'ai';
import { provider } from '~/lib/ai/providers';
import logger from '~/lib/logger';
import type { SlackMessageContext } from '~/types';
import { toLogError } from '~/utils/error';

export async function setConversationTitle(
  context: SlackMessageContext,
  messageText: string
): Promise<void> {
  const { event, client } = context;

  // Only set title for new DM threads (not thread replies)
  if (event.channel_type !== 'im' || event.thread_ts) {
    return;
  }

  try {
    const { text: title } = await generateText({
      model: provider.languageModel('summariser-model'),
      prompt: `Generate a short 3-7 word title for a conversation that starts with this message. Reply with ONLY the title, no punctuation, no quotes:\n\n${messageText}`,
      maxOutputTokens: 20,
    });

    await client.assistant.threads.setTitle({
      channel_id: event.channel,
      thread_ts: event.ts,
      title: title.trim(),
    });
  } catch (error) {
    logger.warn(
      { ...toLogError(error), channel: event.channel },
      'Failed to set conversation title'
    );
  }
}
