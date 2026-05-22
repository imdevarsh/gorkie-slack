import { errorMessage, toLogError } from "@repo/utils/error";
import { tool } from "ai";
import PQueue from "p-queue";
import { z } from "zod";
import { sandbox as config } from "@/config";
import { env } from "@/env";
import { createTask, finishTask, updateTask } from "@/lib/ai/utils/task";
import logger from "@/lib/logger";
import { clearSandboxClient, setSandboxClient } from "@/lib/sandbox/active";
import { syncAttachments } from "@/lib/sandbox/attachments";
import { getResponse, subscribeEvents } from "@/lib/sandbox/events";
import { runWithModelRetry } from "@/lib/sandbox/model-retry";
import {
  pauseSession,
  resolveSession,
  revokeSessionProxyToken,
} from "@/lib/sandbox/session";
import { extendSandboxTimeout } from "@/lib/sandbox/timeout";
import { getToolTaskEnd, getToolTaskStart } from "@/lib/sandbox/tools";
import type { SlackFile, SlackMessageContext, Stream } from "@/types";
import type { AgentSessionEvent } from "@/types/sandbox/rpc";
import { getContextId } from "@/utils/context";

const KEEP_ALIVE_INTERVAL_MS = 3 * 60 * 1000;
const SANDBOX_MIN_REMAINING_MS = 5 * 60 * 1000;

function getAgentError(events: AgentSessionEvent[]): string | null {
  for (const event of events) {
    if (event.type !== "agent_end") {
      continue;
    }

    const messages = "messages" in event ? event.messages : undefined;
    if (!Array.isArray(messages)) {
      continue;
    }

    for (const message of messages) {
      if (!(message && typeof message === "object")) {
        continue;
      }
      if (!("stopReason" in message && message.stopReason === "error")) {
        continue;
      }

      const errorMessage =
        "errorMessage" in message && typeof message.errorMessage === "string"
          ? message.errorMessage.trim()
          : "";
      return errorMessage || "Sandbox agent stopped with an error";
    }
  }

  return null;
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
      "Delegate a task to the sandbox runtime for code execution, file processing, or data analysis. The sandbox maintains persistent state across calls in this conversation, files, installed packages, written code, and previous results are all preserved. Reference prior work directly without re-explaining it.",
    inputSchema: z.object({
      task: z
        .string()
        .describe(
          "A clear description of what to accomplish. The sandbox remembers all previous work in this thread, files, code, and context from earlier runs are available. Reference them directly."
        ),
    }),
    onInputStart: async ({ toolCallId }) => {
      await createTask(stream, {
        taskId: toolCallId,
        title: "Running sandbox",
        status: "pending",
      });
    },
    execute: async ({ task }, { toolCallId }) => {
      const ctxId = getContextId(context);
      let runtime: Awaited<ReturnType<typeof resolveSession>> | null = null;
      const tasks = new Map<string, string>();
      const queue = new PQueue({ concurrency: 1 });
      const enqueue = (fn: () => Promise<unknown>) => {
        queue.add(fn).catch((error: unknown) => {
          logger.warn(
            { ...toLogError(error), ctxId },
            "[sandbox] Failed queued task update"
          );
        });
      };

      const taskId = await updateTask(stream, {
        taskId: toolCallId,
        title: "Running sandbox",
        details: task,
        status: "in_progress",
      });

      try {
        runtime = await resolveSession(context);
        if (!runtime) {
          throw new Error("[sandbox] Failed to resolve runtime session");
        }
        const session = runtime;
        setSandboxClient(ctxId, session.client);
        const uploads = await syncAttachments(session.sandbox, context, files);
        const prompt = `${task}${uploads.length > 0 ? `\n\n<files>\n${JSON.stringify(uploads, null, 2)}\n</files>` : ""}\n\nUpload results with showFile as soon as they are ready, do not wait until the end. End with a structured summary (Summary/Files/Notes).`;
        const keepSandboxAlive = () =>
          extendSandboxTimeout(session.sandbox, SANDBOX_MIN_REMAINING_MS);

        const eventStream: AgentSessionEvent[] = [];
        const unsubscribe = subscribeEvents({
          runtime: session,
          context,
          ctxId,
          events: eventStream,
          onRetry: ({ attempt, maxAttempts, delayMs }) => {
            const seconds = Math.round(delayMs / 1000);
            enqueue(() =>
              updateTask(stream, {
                taskId,
                status: "in_progress",
                details: `Retrying... (${attempt}/${maxAttempts}, waiting ${seconds}s)`,
              })
            );
          },
          onToolStart: ({ toolName, toolCallId, args, status }) => {
            keepSandboxAlive().catch((error: unknown) => {
              logger.warn(
                { ...toLogError(error), ctxId, toolName, toolCallId },
                "[sandbox] Failed to extend timeout"
              );
            });
            const toolTask = getToolTaskStart({ toolName, args, status });
            const id = `${taskId}:${toolCallId}`;
            tasks.set(toolCallId, id);
            enqueue(() =>
              createTask(stream, {
                taskId: id,
                title: toolTask.title,
                details: toolTask.details,
                status: "in_progress",
              })
            );
          },
          onToolEnd: ({ toolName, toolCallId, isError, result }) => {
            const id = tasks.get(toolCallId);
            if (!id) {
              return;
            }
            tasks.delete(toolCallId);
            const { output } = getToolTaskEnd({ toolName, result, isError });
            enqueue(() =>
              finishTask(stream, {
                status: isError ? "error" : "complete",
                taskId: id,
                output,
              })
            );
          },
        });

        const keepAlive = setInterval(() => {
          keepSandboxAlive().catch((error: unknown) => {
            logger.warn(
              { ...toLogError(error), ctxId },
              "[sandbox] Keep-alive failed"
            );
          });
          enqueue(() => updateTask(stream, { taskId, status: "in_progress" }));
        }, KEEP_ALIVE_INTERVAL_MS);

        let timeoutId: ReturnType<typeof setTimeout> | undefined;
        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutId = setTimeout(
            () => reject(new Error("[sandbox] Execution timed out")),
            config.runtime.executionTimeoutMs
          );
        });

        try {
          await runWithModelRetry({
            client: session.client,
            prompt,
            timeoutPromise,
            ctxId,
            onModelSwitch: (attempt, total) => {
              enqueue(() =>
                updateTask(stream, {
                  taskId,
                  status: "in_progress",
                  details: `Model failed, retrying with fallback (${attempt}/${total})...`,
                })
              );
            },
          });
        } catch (error) {
          await session.client.abort().catch(() => null);
          throw error;
        } finally {
          clearTimeout(timeoutId);
          clearInterval(keepAlive);
          unsubscribe();
        }

        const agentError = getAgentError(eventStream);
        if (agentError) {
          throw new Error(`[sandbox] Agent failed: ${agentError}`);
        }

        await queue.onIdle();

        const response =
          (
            await session.client.getLastAssistantText().catch(() => null)
          )?.trim() ||
          getResponse(eventStream) ||
          "Done";

        logger.info(
          {
            ctxId,
            sandboxId: session.sandbox.sandboxId,
            attachments: uploads.map((file) => file.uri),
            task,
            response,
          },
          "[sandbox] Sandbox run completed"
        );

        await finishTask(stream, {
          status: "complete",
          taskId,
          output: response,
        });

        return { success: true, response };
      } catch (error) {
        const message = errorMessage(error);

        logger.error(
          { ...toLogError(error), ctxId, task, message },
          "[sandbox] Sandbox run failed"
        );

        await finishTask(stream, {
          status: "error",
          taskId,
          output: message,
        });

        return { success: false, error: message, task };
      } finally {
        clearSandboxClient(ctxId);
        if (runtime) {
          await runtime.client.disconnect().catch((error: unknown) => {
            logger.debug(
              { ...toLogError(error), ctxId },
              "[sandbox] Failed to disconnect Pi client"
            );
          });
          await revokeSessionProxyToken(runtime.sandbox.sandboxId).catch(
            (error: unknown) => {
              logger.debug(
                { ...toLogError(error), ctxId },
                "[sandbox] Failed to revoke proxy token"
              );
            }
          );
          if (env.NODE_ENV === "production") {
            // Only pause in development to allow inspection
            await pauseSession(context, runtime.sandbox.sandboxId).catch(
              (error: unknown) => {
                logger.debug(
                  { ...toLogError(error), ctxId },
                  "[sandbox] Failed to pause sandbox session"
                );
              }
            );
          }
        }
      }
    },
  });
