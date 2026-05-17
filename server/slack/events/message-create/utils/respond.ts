import {
  type LanguageModel,
  type ModelMessage,
  NoOutputGeneratedError,
  type UserContent,
} from 'ai';
import {
  consumeOrchestratorReasoningStream,
  orchestratorAgent,
  resolveOrchestratorTask,
} from '~/lib/ai/agents/orchestrator';
import { consentFallbackModel } from '~/lib/ai/providers';
import { setStatus } from '~/lib/ai/utils/status';
import { closeStream, initStream, setPlanTitle } from '~/lib/ai/utils/stream';
import type { ChatRequestHints, SlackMessageContext, Stream } from '~/types';
import { getErrorDetails } from '~/utils/error';
import { processSlackFiles } from '~/utils/images';
import { getSlackUserName } from '~/utils/users';

const OUT_OF_CREDITS_ERROR = consentFallbackModel
  ? 'Gorkie is out of credits right now. Use `!retry <your message>` to resend your message through Google (no conversation history included).'
  : 'Gorkie is out of credits right now. Try again later.';

export async function generateResponse(
  context: SlackMessageContext,
  messages: ModelMessage[],
  requestHints: ChatRequestHints,
  options?: {
    modelOverride?: LanguageModel;
    withoutHistory?: boolean;
    overrideMessageText?: string;
    forceDirectReply?: boolean;
  }
) {
  let stream: Stream | null = null;

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

    stream = await initStream(context);

    const userId = context.event.user;
    const messageText =
      options?.overrideMessageText ?? context.event.text ?? '';
    const files = context.event.files;
    const authorName = userId
      ? await getSlackUserName(context.client, userId)
      : 'user';

    const imageContents = await processSlackFiles(files);

    const replyPrompt = `${options?.forceDirectReply ? 'Answer this message directly. Do not skip it.\n\n' : ''}You are replying to the following message from ${authorName} (${userId}): ${messageText}`;
    let currentMessageContent: UserContent;
    if (imageContents.length > 0) {
      currentMessageContent = [
        { type: 'text' as const, text: replyPrompt },
        ...imageContents,
      ];
    } else {
      currentMessageContent = replyPrompt;
    }

    const agent = orchestratorAgent({
      context,
      requestHints,
      files,
      stream,
      ...(options?.modelOverride ? { model: options.modelOverride } : {}),
    });

    const streamResult = await agent.stream({
      messages: options?.withoutHistory
        ? [
            {
              role: 'user',
              content: currentMessageContent,
            },
          ]
        : [
            ...messages,
            {
              role: 'user',
              content: currentMessageContent,
            },
          ],
    });
    await consumeOrchestratorReasoningStream({
      context,
      stream,
      fullStream: streamResult.fullStream,
    });
    const toolCalls = await streamResult.toolCalls;

    await closeStream(stream);
    await setStatus(context, { status: '' });

    return { success: true, toolCalls };
  } catch (error) {
    const isOutOfCredits = error instanceof NoOutputGeneratedError;
    const errorDetails = getErrorDetails(error);
    const detailParts = [errorDetails.name];
    if (errorDetails.statusCode !== undefined) {
      detailParts.push(`status ${errorDetails.statusCode}`);
    }
    if (errorDetails.code) {
      detailParts.push(`code ${errorDetails.code}`);
    }
    const failureDetails = `${detailParts.join(' | ')}: ${errorDetails.message}`;

    if (stream) {
      await setPlanTitle(
        stream,
        isOutOfCredits ? 'Temporarily Unavailable' : 'Generation Failed'
      );
      await resolveOrchestratorTask({
        context,
        stream,
        title: isOutOfCredits ? 'Temporarily Unavailable' : 'Generation Failed',
        details: isOutOfCredits ? OUT_OF_CREDITS_ERROR : failureDetails,
      });
      await closeStream(stream);
    }
    await setStatus(context, { status: 'failed to generate' });
    return {
      success: false,
      error: isOutOfCredits
        ? OUT_OF_CREDITS_ERROR
        : 'Oops! Something went wrong, try again later.',
    };
  }
}
