import type { Sandbox } from '@e2b/code-interpreter';
import PQueue from 'p-queue';
import { sandbox as config } from '~/config';
import { createTask, finishTask, updateTask } from '~/lib/ai/utils/task';
import logger from '~/lib/logger';
import { syncAttachments } from '~/lib/sandbox/attachments';
import { getResponse, subscribeEvents } from '~/lib/sandbox/events';
import { pauseSession, resolveSession } from '~/lib/sandbox/session';
import { extendSandboxTimeout } from '~/lib/sandbox/timeout';
import { getToolTaskEnd, getToolTaskStart } from '~/lib/sandbox/tools';
import type {
  SlackFile,
  SlackMessageContext,
  Stream,
  ToolEndEvent,
  ToolStartEvent,
} from '~/types';
import type { AgentSessionEvent } from '~/types/sandbox/rpc';
import { getContextId } from '~/utils/context';
import { errorMessage, toLogError } from '~/utils/error';

type Enqueue = (fn: () => Promise<unknown>) => void;

interface RunSandboxTaskParams {
  context: SlackMessageContext;
  files?: SlackFile[];
  stream: Stream;
  task: string;
  toolCallId: string;
}

function createTaskQueue(ctxId: string) {
  const queue = new PQueue({ concurrency: 1 });
  const enqueue = (fn: () => Promise<unknown>) => {
    queue.add(fn).catch((error: unknown) => {
      logger.warn(
        { ...toLogError(error), ctxId },
        '[sandbox] Failed queued task update'
      );
    });
  };
  return { queue, enqueue };
}

function buildPrompt(task: string, uploads: { uri: string }[]): string {
  const filesSection =
    uploads.length > 0
      ? `\n\n<files>\n${JSON.stringify(uploads, null, 2)}\n</files>`
      : '';

  return `${task}${filesSection}\n\nUpload results with showFile as soon as they are ready, do not wait until the end. End with a structured summary (Summary/Files/Notes).`;
}

async function runWithTimeout(
  run: () => Promise<void>,
  executionTimeoutMs: number
): Promise<void> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error('[sandbox] Execution timed out')),
      executionTimeoutMs
    );
  });

  try {
    await Promise.race([run(), timeoutPromise]);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function disconnectAndPause(params: {
  runtime: Awaited<ReturnType<typeof resolveSession>> | null;
  context: SlackMessageContext;
  ctxId: string;
}) {
  const { runtime, context, ctxId } = params;
  if (!runtime) {
    return;
  }

  await runtime.client.disconnect().catch((error: unknown) => {
    logger.debug(
      { ...toLogError(error), ctxId },
      '[subagent] Failed to disconnect Pi client'
    );
  });
  await pauseSession(context, runtime.sandbox.sandboxId);
}

function keepAliveTask(enqueue: Enqueue, stream: Stream, taskId: string) {
  return setInterval(
    () => {
      enqueue(() => updateTask(stream, { taskId, status: 'in_progress' }));
    },
    3 * 60 * 1000
  );
}

function onToolStartHandler(params: {
  enqueue: Enqueue;
  stream: Stream;
  parentTaskId: string;
  tasks: Map<string, string>;
  sandbox: Sandbox;
  ctxId: string;
}) {
  const { enqueue, stream, parentTaskId, tasks, sandbox, ctxId } = params;

  return ({ toolName, toolCallId, args, status }: ToolStartEvent) => {
    extendSandboxTimeout(sandbox).catch((error: unknown) => {
      logger.warn(
        { ...toLogError(error), ctxId, toolName, toolCallId },
        '[sandbox] Failed to extend timeout'
      );
    });
    const toolTask = getToolTaskStart({ toolName, args, status });
    const id = `${parentTaskId}:${toolCallId}`;
    tasks.set(toolCallId, id);
    enqueue(() =>
      createTask(stream, {
        taskId: id,
        title: toolTask.title,
        details: toolTask.details,
        status: 'in_progress',
      })
    );
  };
}

function onToolEndHandler(params: {
  enqueue: Enqueue;
  stream: Stream;
  tasks: Map<string, string>;
}) {
  const { enqueue, stream, tasks } = params;
  return ({ toolName, toolCallId, isError, result }: ToolEndEvent) => {
    const id = tasks.get(toolCallId);
    if (!id) {
      return;
    }
    tasks.delete(toolCallId);
    const { output } = getToolTaskEnd({ toolName, result, isError });
    enqueue(() =>
      finishTask(stream, {
        status: isError ? 'error' : 'complete',
        taskId: id,
        output,
      })
    );
  };
}

export async function runSandboxTask({
  context,
  files,
  stream,
  task,
  toolCallId,
}: RunSandboxTaskParams): Promise<
  | { response: string; success: true }
  | { error: string; success: false; task: string }
> {
  const ctxId = getContextId(context);
  let runtime: Awaited<ReturnType<typeof resolveSession>> | null = null;
  const tasks = new Map<string, string>();
  const { queue, enqueue } = createTaskQueue(ctxId);

  const taskId = await updateTask(stream, {
    taskId: toolCallId,
    title: 'Running sandbox',
    details: task,
    status: 'in_progress',
  });

  try {
    runtime = await resolveSession(context);
    const activeRuntime = runtime;
    const uploads = await syncAttachments(
      activeRuntime.sandbox,
      context,
      files
    );
    const prompt = buildPrompt(task, uploads);
    const eventStream: AgentSessionEvent[] = [];
    const unsubscribe = subscribeEvents({
      client: activeRuntime.client,
      runtime: activeRuntime,
      context,
      ctxId,
      events: eventStream,
      onRetry: ({ attempt, maxAttempts, delayMs }) => {
        const seconds = Math.round(delayMs / 1000);
        enqueue(() =>
          updateTask(stream, {
            taskId,
            status: 'in_progress',
            details: `Retrying... (${attempt}/${maxAttempts}, waiting ${seconds}s)`,
          })
        );
      },
      onToolStart: onToolStartHandler({
        enqueue,
        stream,
        parentTaskId: taskId,
        tasks,
        sandbox: activeRuntime.sandbox,
        ctxId,
      }),
      onToolEnd: onToolEndHandler({ enqueue, stream, tasks }),
    });
    const keepAlive = keepAliveTask(enqueue, stream, taskId);

    try {
      await runWithTimeout(async () => {
        await activeRuntime.client.prompt(prompt);
        await activeRuntime.client.waitForIdle();
      }, config.runtime.executionTimeoutMs);
    } catch (error) {
      await activeRuntime.client.abort().catch(() => null);
      throw error;
    } finally {
      clearInterval(keepAlive);
      unsubscribe();
    }

    await queue.onIdle();

    const response =
      (
        await activeRuntime.client.getLastAssistantText().catch(() => null)
      )?.trim() ||
      getResponse(eventStream) ||
      'Done';

    logger.info(
      {
        ctxId,
        sandboxId: activeRuntime.sandbox.sandboxId,
        attachments: uploads.map((file) => file.uri),
        task,
        response,
      },
      '[sandbox] Sandbox run completed'
    );

    await finishTask(stream, {
      status: 'complete',
      taskId,
      output: response,
    });

    return { success: true, response };
  } catch (error) {
    const message = errorMessage(error);

    logger.error(
      { ...toLogError(error), ctxId, task, message },
      '[sandbox] Sandbox run failed'
    );

    await finishTask(stream, {
      status: 'error',
      taskId,
      output: message.slice(0, 200),
    });

    return { success: false, error: message, task };
  } finally {
    await disconnectAndPause({ runtime, context, ctxId });
  }
}
