import { getErrorDetails } from '@repo/utils/error';
import {
  APICallError,
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
import { getSlackUserName } from '@/utils/users';

export async function generateResponse(
  context: SlackMessageContext,
  messages: ModelMessage[],
  requestHints: ChatRequestHints
) {
  const ctxId = getContextId(context);
  const controller = createAbortController(ctxId);
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
    const messageText = context.event.text ?? '';

    if (messages.length === 0) {
      setConversationTitle(context, messageText).catch(() => undefined);
    }
    const files = context.event.files;
    const authorName = userId
      ? await getSlackUserName(context.client, userId)
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

    return { success: true, toolCalls };
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
      return { success: false };
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

    const isInsufficientCredits =
      APICallError.isInstance(error) && error.statusCode === 402;

    return {
      success: false,
      error: isInsufficientCredits
        ? "It looks like Hack Club AI is currently down or out of capacity — this is outside of my control. You can check the status at https://status.ai.hackclub.com/ and try again once it's back up!"
        : error instanceof NoOutputGeneratedError
          ? 'Oops! Gorkie is out of credits right now. Please try again later.'
          : 'Oops! Something went wrong, try again later.',
    };
  } finally {
    clearAbortController(ctxId);
  }
}
