import { errorMessage, toLogError } from '@repo/utils/error';
import { asRecord } from '@repo/utils/record';
import { clampText } from '@repo/utils/text';
import { tool } from 'ai';
import PQueue from 'p-queue';
import { z } from 'zod';
import { sandbox as config } from '@/config';
import { env } from '@/env';
import { createTask, finishTask, updateTask } from '@/lib/ai/utils/task';
import logger from '@/lib/logger';
import {
  clearActiveSandboxController,
  setActiveSandboxController,
} from '@/lib/sandbox/active';
import {
  finishSession,
  refreshSessionTimeout,
  resolveSession,
} from '@/lib/sandbox/session';
import type { SlackFile, SlackMessageContext, Stream } from '@/types';
import { getContextId } from '@/utils/context';

const KEEP_ALIVE_INTERVAL_MS = 3 * 60 * 1000;
const SANDBOX_MIN_REMAINING_MS = 5 * 60 * 1000;

const toolTitles = {
  bash: 'Run command',
  read: 'Read file',
  write: 'Write file',
  edit: 'Edit file',
  grep: 'Search text',
  glob: 'Find files',
  ls: 'List files',
  showFile: 'Upload file',
} as const;

function normalizeToolInput(input: unknown): unknown {
  if (typeof input !== 'string') {
    return input;
  }

  try {
    return JSON.parse(input) as unknown;
  } catch {
    return input;
  }
}

function getString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function getInputValue(input: unknown, key: string): string | undefined {
  return getString(asRecord(input)?.[key]);
}

function getStatus(input: unknown): string | undefined {
  const status = asRecord(input)?.status;
  return typeof status === 'string' ? status.slice(0, 49) : undefined;
}

function getToolTitle(
  toolName: string,
  input: unknown,
  title?: string
): string {
  return clampText(
    title ??
      getStatus(input) ??
      toolTitles[toolName as keyof typeof toolTitles] ??
      toolName,
    config.toolOutput.titleMaxChars
  );
}

function getToolDetails(toolName: string, input: unknown): string {
  switch (toolName) {
    case 'bash':
      return `input:\n\n${getInputValue(input, 'command') ?? 'running command'}`;
    case 'read':
      return `Reading ${getInputValue(input, 'file_path') ?? 'file'}`;
    case 'write':
      return `Writing ${getInputValue(input, 'file_path') ?? 'file'}`;
    case 'edit':
      return `Editing ${getInputValue(input, 'file_path') ?? 'file'}`;
    case 'grep': {
      const pattern = getInputValue(input, 'pattern') ?? '<pattern>';
      const path = getInputValue(input, 'path') ?? '.';
      return `Searching "${pattern}" in ${path}`;
    }
    case 'glob': {
      const pattern = getInputValue(input, 'pattern') ?? '<pattern>';
      const path = getInputValue(input, 'path') ?? '.';
      return `Finding "${pattern}" in ${path}`;
    }
    case 'ls':
      return `Listing ${getInputValue(input, 'path') ?? '.'}`;
    case 'showFile':
      return `Uploading ${getInputValue(input, 'path') ?? 'file'}`;
    default:
      return `Running ${toolName}`;
  }
}

function getToolOutput({
  isError,
  output,
  toolName,
}: {
  isError: boolean;
  output: unknown;
  toolName: string;
}): string | undefined {
  if (toolName === 'showFile') {
    const path = getString(asRecord(output)?.path);
    if (path) {
      return clampText(`Uploaded ${path}`, config.toolOutput.outputMaxChars);
    }
  }

  const text =
    getString(output) ??
    getString(asRecord(output)?.text) ??
    getString(asRecord(output)?.reason) ??
    getString(asRecord(output)?.message);

  if (text) {
    return toolName === 'bash'
      ? `output:\n${clampText(text, config.toolOutput.outputMaxChars)}`
      : clampText(text, config.toolOutput.outputMaxChars);
  }

  if (isError) {
    return clampText('Tool execution failed', config.toolOutput.outputMaxChars);
  }

  return;
}

export const sandbox = ({
  context,
  files,
  stream,
}: {
  context: SlackMessageContext;
  files?: SlackFile[];
  stream: Stream;
}) =>
  tool({
    description:
      'Delegate a task to the sandbox runtime for code execution, file processing, or data analysis. The sandbox maintains persistent state across calls in this conversation, files, installed packages, written code, and previous results are all preserved. Reference prior work directly without re-explaining it.',
    inputSchema: z.object({
      task: z
        .string()
        .describe(
          'A clear description of what to accomplish. The sandbox remembers all previous work in this thread, files, code, and context from earlier runs are available. Reference them directly.'
        ),
    }),
    onInputStart: async ({ toolCallId }) => {
      await createTask(stream, {
        taskId: toolCallId,
        title: 'Running sandbox',
        status: 'pending',
      });
    },
    execute: async ({ task }, { toolCallId }) => {
      const ctxId = getContextId(context);
      let runtime: Awaited<ReturnType<typeof resolveSession>> | null = null;
      const controller = new AbortController();
      const tasks = new Map<string, string>();
      const textChunks: string[] = [];
      const queue = new PQueue({ concurrency: 1 });
      const keepSandboxAlive = () =>
        runtime
          ? refreshSessionTimeout({
              minimumTimeoutMs: SANDBOX_MIN_REMAINING_MS,
              runtime,
            })
          : Promise.resolve();
      const enqueue = (fn: () => Promise<unknown>) => {
        queue.add(fn).catch((error: unknown) => {
          logger.warn(
            { ...toLogError(error), ctxId },
            '[sandbox] Failed queued task update'
          );
        });
      };

      const taskId = await updateTask(stream, {
        taskId: toolCallId,
        title: 'Running sandbox',
        details: task,
        status: 'in_progress',
      });

      setActiveSandboxController(ctxId, controller);

      const timeoutId = setTimeout(
        () => controller.abort(new Error('[sandbox] Execution timed out')),
        config.runtime.executionTimeoutMs
      );

      const keepAlive = setInterval(() => {
        keepSandboxAlive().catch((error: unknown) => {
          logger.warn(
            { ...toLogError(error), ctxId },
            '[sandbox] Keep-alive failed'
          );
        });
        enqueue(() => updateTask(stream, { taskId, status: 'in_progress' }));
      }, KEEP_ALIVE_INTERVAL_MS);

      try {
        runtime = await resolveSession(context, files);

        const prompt = `${task}${
          runtime.uploads.length > 0
            ? `\n\n<files>\n${JSON.stringify(runtime.uploads, null, 2)}\n</files>`
            : ''
        }\n\nUpload results with showFile as soon as they are ready, do not wait until the end. End with a structured summary (Summary/Files/Notes).`;

        const result = await runtime.agent.stream({
          abortSignal: controller.signal,
          prompt,
          session: runtime.session,
        });
        const responsePromise = Promise.resolve(result.response).catch(
          (error: unknown) => {
            logger.debug(
              { ...toLogError(error), ctxId },
              '[sandbox] Stream response promise rejected'
            );
            return null;
          }
        );

        for await (const part of result.stream) {
          if (part.type === 'text-delta') {
            textChunks.push(part.text);
            continue;
          }

          if (part.type === 'tool-call') {
            const input = normalizeToolInput(part.input);
            keepSandboxAlive().catch((error: unknown) => {
              logger.warn(
                { ...toLogError(error), ctxId, tool: part.toolName },
                '[sandbox] Failed to extend timeout'
              );
            });
            logger.info(
              { ctxId, tool: part.toolName, input },
              '[sandbox] Tool started'
            );
            const id = `${taskId}:${part.toolCallId}`;
            tasks.set(part.toolCallId, id);
            enqueue(() =>
              createTask(stream, {
                taskId: id,
                title: getToolTitle(part.toolName, input, part.title),
                details: clampText(
                  getToolDetails(part.toolName, input),
                  config.toolOutput.detailsMaxChars
                ),
                status: 'in_progress',
              })
            );
            continue;
          }

          if (part.type === 'tool-result' || part.type === 'tool-error') {
            const id = tasks.get(part.toolCallId);
            if (!id) {
              continue;
            }
            tasks.delete(part.toolCallId);
            const isError = part.type === 'tool-error';
            const output = getToolOutput({
              isError,
              output: isError ? part.error : part.output,
              toolName: part.toolName,
            });
            logger[isError ? 'warn' : 'info'](
              {
                ctxId,
                tool: part.toolName,
                isError,
                result: isError ? part.error : part.output,
              },
              '[sandbox] Tool completed'
            );
            enqueue(() =>
              finishTask(stream, {
                status: isError ? 'error' : 'complete',
                taskId: id,
                output,
              })
            );
            continue;
          }

          if (part.type === 'error') {
            throw part.error;
          }
        }

        await queue.onIdle();
        await responsePromise;

        const response = textChunks.join('').trim() || 'Done';

        logger.info(
          {
            ctxId,
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
          output: message,
        });

        return { success: false, error: message, task };
      } finally {
        clearTimeout(timeoutId);
        clearInterval(keepAlive);
        clearActiveSandboxController(ctxId);
        if (runtime) {
          await finishSession({
            runtime,
            status: env.NODE_ENV === 'production' ? 'paused' : 'active',
          }).catch((error: unknown) => {
            logger.debug(
              { ...toLogError(error), ctxId },
              '[sandbox] Failed to persist harness session'
            );
          });
        }
      }
    },
  });
