import { generateText } from 'ai';
import { provider } from '~/lib/ai/providers';
import logger from '~/lib/logger';
import type { SlackMessageContext } from '~/types';
import { toLogError } from '~/utils/error';
import { cleanText, trimmed } from '~/utils/text';

export async function setConversationTitle(
  context: SlackMessageContext,
  messageText: string
): Promise<void> {
  const { event, client } = context;

  // Only set title for new DM threads (not thread replies)
  if (event.channel_type !== 'im' || event.thread_ts) {
    return;
  }

  const prompt = trimmed(cleanText(messageText));
  if (!prompt) {
    return;
  }

  try {
    const { text } = await generateText({
      model: provider.languageModel('summariser-model'),
      prompt: `Write a short Slack conversation title for the opening message below.

Rules:
- 3 to 7 words
- plain text only
- no quotes
- no trailing punctuation
- summarize the actual request, not the assistant persona

Opening message:
${prompt}`,
      maxOutputTokens: 20,
    });

    const title = trimmed(cleanText(text));
    if (!title) {
      return;
    }

    await client.assistant.threads.setTitle({
      channel_id: event.channel,
      thread_ts: event.ts,
      title,
    });
  } catch (error) {
    logger.warn(
      { ...toLogError(error), channel: event.channel },
      'Failed to set conversation title'
    );
  }
}
