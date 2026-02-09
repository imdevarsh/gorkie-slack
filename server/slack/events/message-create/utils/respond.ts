import { webSearch } from '@exalabs/ai-sdk';
import type { ModelMessage, UserContent } from 'ai';
import { generateText, stepCountIs } from 'ai';
import { systemPrompt } from '~/lib/ai/prompts';
import { provider } from '~/lib/ai/providers';
import {
  executeCode,
  formatAttachmentContext,
  getOrCreate,
  snapshotAndStop,
  transportAttachments,
} from '~/lib/ai/tools/execute-code';
import { getUserInfo } from '~/lib/ai/tools/get-user-info';
import { getWeather } from '~/lib/ai/tools/get-weather';
import { leaveChannel } from '~/lib/ai/tools/leave-channel';
import { mermaid } from '~/lib/ai/tools/mermaid';
import { react } from '~/lib/ai/tools/react';
import { reply } from '~/lib/ai/tools/reply';
import { scheduleReminder } from '~/lib/ai/tools/schedule-reminder';
import { searchSlack } from '~/lib/ai/tools/search-slack';
import { skip } from '~/lib/ai/tools/skip';
import { summariseThread } from '~/lib/ai/tools/summarise-thread';
import { successToolCall } from '~/lib/ai/utils';
import logger from '~/lib/logger';
import type { RequestHints, SlackMessageContext } from '~/types';
import { getContextId } from '~/utils/context';
import { processSlackFiles, type SlackFile } from '~/utils/images';
import { getSlackUserName } from '~/utils/users';

async function prepareAttachments(
  ctxId: string,
  messageTs: string,
  files: SlackFile[] | undefined
): Promise<string> {
  if (!files || files.length === 0) {
    return '';
  }

  const sandbox = await getOrCreate(ctxId);
  const transported = await transportAttachments(sandbox, messageTs, files);
  return formatAttachmentContext(transported);
}

export async function generateResponse(
  context: SlackMessageContext,
  messages: ModelMessage[],
  hints: RequestHints
) {
  const threadTs =
    (context.event as { thread_ts?: string }).thread_ts ?? context.event.ts;

  try {
    await context.client.assistant.threads.setStatus({
      channel_id: context.event.channel,
      thread_ts: threadTs,
      status: 'is thinking',
      loading_messages: [
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

    const system = systemPrompt({
      requestHints: hints,
    });

    const ctxId = getContextId(context);
    const [imageContents, attachmentContext] = await Promise.all([
      processSlackFiles(files),
      prepareAttachments(ctxId, context.event.ts, files),
    ]);

    const replyPrompt = `You are replying to the following message from ${authorName} (${userId}): ${messageText}${attachmentContext}`;

    let currentMessageContent: UserContent;
    if (imageContents.length > 0) {
      currentMessageContent = [
        { type: 'text' as const, text: replyPrompt },
        ...imageContents,
      ];
    } else {
      currentMessageContent = replyPrompt;
    }

    const { toolCalls } = await generateText({
      model: provider.languageModel('chat-model'),
      messages: [
        ...messages,
        {
          role: 'user',
          content: currentMessageContent,
        },
      ],
      providerOptions: {
        openrouter: {
          reasoning: {
            enabled: true,
            exclude: false,
            effort: 'medium',
          },
        },
      },
      temperature: 1.1,
      toolChoice: 'required',
      tools: {
        getWeather,
        searchWeb: webSearch({
          numResults: 10,
          type: 'auto',
        }),
        searchSlack: searchSlack({ context }),
        getUserInfo: getUserInfo({ context }),
        leaveChannel: leaveChannel({ context }),
        scheduleReminder: scheduleReminder({ context }),
        summariseThread: summariseThread({ context }),
        executeCode: executeCode({ context }),
        mermaid: mermaid({ context }),
        react: react({ context }),
        reply: reply({ context }),
        skip: skip({ context }),
      },
      system,
      stopWhen: [
        stepCountIs(25),
        successToolCall('leave-channel'),
        successToolCall('reply'),
        // successToolCall('react'),
        successToolCall('skip'),
      ],
      experimental_telemetry: {
        isEnabled: true,
        functionId: 'chat',
        metadata: {
          userId: userId || 'unknown-user',
        },
      },
    });

    await context.client.assistant.threads.setStatus({
      channel_id: context.event.channel,
      thread_ts: threadTs,
      status: '',
    });

    return { success: true, toolCalls };
  } catch (e) {
    try {
      await context.client.assistant.threads.setStatus({
        channel_id: context.event.channel,
        thread_ts: threadTs,
        status: '',
      });
    } catch {
      // ignore errors
    }
    return {
      success: false,
      error: (e as Error)?.message,
    };
  } finally {
    const ctxId = getContextId(context);
    snapshotAndStop(ctxId).catch((error: unknown) => {
      logger.warn({ error, ctxId }, 'Sandbox snapshot failed');
    });
  }
}
