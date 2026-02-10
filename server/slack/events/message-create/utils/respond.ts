import type { ModelMessage, UserContent } from 'ai';
import { orchestratorAgent } from '~/lib/ai/agents';
import { setStatus } from '~/lib/ai/utils/status';
import logger from '~/lib/logger';
import { stopSandbox } from '~/lib/sandbox';
import type { RequestHints, SlackMessageContext } from '~/types';
import { getContextId } from '~/utils/context';
import { processSlackFiles, type SlackFile } from '~/utils/images';
import { getSlackUserName } from '~/utils/users';

export async function generateResponse(
  context: SlackMessageContext,
  messages: ModelMessage[],
  hints: RequestHints
) {
  const ctxId = getContextId(context);

  try {
    await setStatus(context, {
      status: 'is thinking',
      loading: [
        'is pondering your question',
        'is working on it',
        'is putting thoughts together',
        'is mulling this over',
        'is figuring this out',
        'is cooking up a response',
        'is connecting the dots',
        'is working through this',
        'is piecing things together',
        'is giving it a good think',
      ],
    });

    const userId = (context.event as { user?: string }).user;
    const messageText = (context.event as { text?: string }).text ?? '';
    const files = (context.event as { files?: SlackFile[] }).files;
    const authorName = userId
      ? await getSlackUserName(context.client, userId)
      : 'user';

    const imageContents = await processSlackFiles(files);

    const replyPrompt = `You are replying to the following message from ${authorName} (${userId}): ${messageText}`;

    let currentMessageContent: UserContent;
    if (imageContents.length > 0) {
      currentMessageContent = [
        { type: 'text' as const, text: replyPrompt },
        ...imageContents,
      ];
    } else {
      currentMessageContent = replyPrompt;
    }

    const agent = orchestratorAgent({ context, hints, files });

    const { toolCalls } = await agent.generate({
      messages: [
        ...messages,
        {
          role: 'user',
          content: currentMessageContent,
        },
      ],
    });

    await setStatus(context, { status: '' });

    return { success: true, toolCalls };
  } catch (e) {
    await setStatus(context, { status: '' });
    return {
      success: false,
      error: e instanceof Error ? e.message : String(e),
    };
  } finally {
    stopSandbox(ctxId).catch((error: unknown) => {
      logger.warn({ error, ctxId }, 'Sandbox snapshot failed');
    });
  }
}
