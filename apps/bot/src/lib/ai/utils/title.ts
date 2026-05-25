import { generateText, provider } from '@repo/ai';
import { toLogError } from '@repo/utils/error';
import { cleanText, trimmed } from '@repo/utils/text';
import logger from '@/lib/logger';
import type { SlackMessageContext } from '@/types';

export async function setConversationTitle(
  context: SlackMessageContext,
  messageText: string
): Promise<void> {
  const { event, client } = context;

  if (event.channel_type !== 'im') {
    return;
  }

  const prompt = trimmed(cleanText(messageText));
  if (!prompt) {
    return;
  }

  const threadTs = event.thread_ts ?? event.ts;
  if (!threadTs) {
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
      thread_ts: threadTs,
      title,
    });
  } catch (error) {
    logger.warn(
      { ...toLogError(error), channel: event.channel },
      'Failed to set conversation title'
    );
  }
}
