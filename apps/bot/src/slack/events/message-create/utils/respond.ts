import { getErrorDetails } from '@repo/utils/error';
import {
  type ModelMessage,
  NoOutputGeneratedError,
  type UserContent,
} from 'ai';
import { clearAbortController, createAbortController } from '@/lib/abort';
import {
  consumeOrchestratorReasoningStream,
  orchestratorAgent,
  resolveOrchestratorTask,
} from '@/lib/ai/agents/orchestrator';
import { setStatus } from '@/lib/ai/utils/status';
import { closeStream, initStream, setPlanTitle } from '@/lib/ai/utils/stream';
import { setConversationTitle } from '@/lib/ai/utils/title';
import type { ChatRequestHints, SlackMessageContext, Stream } from '@/types';
import { getContextId } from '@/utils/context';
import { processSlackFiles } from '@/utils/images';
import { getSlackUser } from '@/utils/users';

export async function generateResponse(
  context: SlackMessageContext,
  messages: ModelMessage[],
  requestHints: ChatRequestHints
) {
  const ctxId = getContextId(context);
  const controller = createAbortController(ctxId);
  let stream: Stream | null = null;
  let fallback = false;
  const allowTraining = requestHints.customization?.allowTraining ?? true;

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
    const messageText = context.event.text ?? '';

    if (messages.length === 0) {
      setConversationTitle(context, messageText).catch(() => undefined);
    }
    const files = context.event.files;
    const authorName = userId
      ? (await getSlackUser(context.client, userId)).name
      : 'user';

    const imageContents = await processSlackFiles(files);

    const replyPrompt = `You are replying to the following message from ${authorName} (${userId}): ${messageText}`;

    const currentMessageContent: UserContent =
      imageContents.length > 0
        ? ([
            { type: 'text', text: replyPrompt },
            ...imageContents,
          ] as UserContent)
        : replyPrompt;

    const agent = orchestratorAgent({
      context,
      requestHints,
      files,
      stream,
      onFallback: () => {
        fallback = true;
      },
    });

    const streamResult = await agent.stream({
      messages: [
        ...messages,
        {
          role: 'user',
          content: currentMessageContent,
        },
      ],
      abortSignal: controller.signal,
    });
    await consumeOrchestratorReasoningStream({
      context,
      stream,
      fullStream: streamResult.fullStream,
    });
    const toolCalls = await streamResult.toolCalls;

    await closeStream(stream);
    await setStatus(context, { status: '' });

    return { success: true, toolCalls, fallback };
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') {
      if (stream) {
        await setPlanTitle(stream, 'Interrupted');
        await resolveOrchestratorTask({
          context,
          stream,
          title: 'Interrupted',
          details: 'Stopped by user.',
        });
        await closeStream(stream);
      }
      await setStatus(context, { status: '' });
      return { success: false, replied: Boolean(stream) };
    }

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
      await setPlanTitle(stream, 'Generation Failed');
      await resolveOrchestratorTask({
        context,
        stream,
        title: 'Generation Failed',
        details: failureDetails,
      });
      await closeStream(stream);
    }
    await setStatus(context, { status: 'failed to generate' });
    let noOutputMessage =
      'Inference is unavailable right now. Please try again shortly.';

    if (!allowTraining) {
      noOutputMessage =
        'Inference is unavailable right now. Turn on data training in settings to let Gorkie use fallback models.';
    } else if (fallback) {
      noOutputMessage =
        'Inference is unavailable right now, and fallback models also failed. Please try again shortly.';
    }

    return {
      success: false,
      replied: Boolean(stream),
      error:
        error instanceof NoOutputGeneratedError
          ? noOutputMessage
          : 'Oops! Something went wrong, try again later.',
    };
  } finally {
    clearAbortController(ctxId);
  }
}
