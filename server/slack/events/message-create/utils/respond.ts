import type { ModelMessage, UserContent } from 'ai';
import { orchestratorAgent } from '~/lib/ai/agents';
import { setStatus } from '~/lib/ai/utils/status';
import logger from '~/lib/logger';
import type { ChatRequestHints, SlackMessageContext } from '~/types';
import { processSlackFiles, type SlackFile } from '~/utils/images';
import { getSlackUserName } from '~/utils/users';

interface SlackTextStream {
  append: (text: string) => Promise<void>;
  stop: () => Promise<void>;
}

async function createTextStream(
  context: SlackMessageContext
): Promise<SlackTextStream | null> {
  const channel = (context.event as { channel?: string }).channel;
  const userId = (context.event as { user?: string }).user;
  const teamId = context.teamId;
  const threadTs =
    (context.event as { thread_ts?: string }).thread_ts ?? context.event.ts;

  if (!(channel && threadTs)) {
    return null;
  }

  const started = await context.client
    .apiCall('chat.startStream', {
      channel,
      thread_ts: threadTs,
      ...(userId && teamId
        ? {
            recipient_user_id: userId,
            recipient_team_id: teamId,
          }
        : {}),
    })
    .catch((error: unknown) => {
      logger.debug(
        { error, channel, threadTs },
        '[chat] startStream for text failed'
      );
      return null;
    });

  const streamTs =
    started &&
    typeof started === 'object' &&
    typeof (started as { ts?: unknown }).ts === 'string'
      ? (started as unknown as { ts: string }).ts
      : null;
  if (!streamTs) {
    return null;
  }

  let queue = Promise.resolve();
  const enqueue = (fn: () => Promise<void>): Promise<void> => {
    queue = queue.then(fn).catch((error: unknown) => {
      logger.debug(
        { error, channel, streamTs },
        '[chat] text stream update failed'
      );
    });
    return queue;
  };

  return {
    append: (text) =>
      enqueue(async () => {
        await context.client.apiCall('chat.appendStream', {
          channel,
          ts: streamTs,
          chunks: [{ type: 'markdown_text', text }],
        });
      }),
    stop: () =>
      enqueue(async () => {
        await context.client.apiCall('chat.stopStream', {
          channel,
          ts: streamTs,
        });
      }),
  };
}

export async function generateResponse(
  context: SlackMessageContext,
  messages: ModelMessage[],
  requestHints: ChatRequestHints
) {
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

    const agent = orchestratorAgent({ context, requestHints, files });

    const result = await agent.stream({
      messages: [
        ...messages,
        {
          role: 'user',
          content: currentMessageContent,
        },
      ],
    });
    let textStream: SlackTextStream | null = null;

    for await (const delta of result.textStream) {
      if (!delta) {
        continue;
      }
      if (!textStream) {
        textStream = await createTextStream(context);
      }
      await textStream?.append(delta);
    }

    if (textStream) {
      await textStream.stop();
    }
    const toolCalls = await result.toolCalls;

    await setStatus(context, { status: '' });

    return { success: true, toolCalls };
  } catch (e) {
    await setStatus(context, { status: '' });
    return {
      success: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
