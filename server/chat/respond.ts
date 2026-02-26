import type { ModelMessage, UserContent } from 'ai';
import { orchestratorAgent } from '~/lib/ai/agents';
import { setStatus } from '~/lib/ai/utils/status';
import { closeStream, initStream } from '~/lib/ai/utils/stream';
import type { ChatRequestHints, ChatRuntimeContext } from '~/types';
import { processSlackFiles, type SlackFile } from '~/utils/images';
import { getSlackUserName } from '~/utils/users';

export async function generateResponse(
  context: ChatRuntimeContext,
  messages: ModelMessage[],
  requestHints: ChatRequestHints
) {
  const stream = await initStream(context);

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

    const userId = context.userId;
    const messageText = context.message.text;
    const files = (context.event as { files?: SlackFile[] }).files;
    const authorName = userId
      ? await getSlackUserName(context.client, userId)
      : 'user';

    const imageContents = await processSlackFiles(files);

    const replyPrompt = `You are replying to the following message from ${authorName} (${userId}): ${messageText}`;

    const currentMessageContent: UserContent =
      imageContents.length > 0
        ? [{ type: 'text', text: replyPrompt }, ...imageContents]
        : replyPrompt;

    const agent = orchestratorAgent({
      context,
      requestHints,
      files,
      stream,
    });

    const { toolCalls } = await agent.generate({
      messages: [
        ...messages,
        {
          role: 'user',
          content: currentMessageContent,
        },
      ],
    });

    await closeStream(stream);
    await setStatus(context, { status: '' });

    return { success: true, toolCalls };
  } catch (error) {
    await closeStream(stream);
    await setStatus(context, { status: '' });

    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
