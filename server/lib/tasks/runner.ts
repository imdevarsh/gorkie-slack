import type { WebClient } from '@slack/web-api';
import {
  claimScheduledTaskRun,
  completeScheduledTaskRun,
  disableScheduledTask,
  listDueScheduledTasks,
} from '~/db/queries/scheduled-tasks';
import type { ScheduledTask } from '~/db/schema';
import { scheduledTaskAgent } from '~/lib/ai/agents/scheduled-task';
import { isUserAllowed } from '~/lib/allowed-users';
import logger from '~/lib/logger';
import type { SlackMessageContext, Stream } from '~/types';
import { errorMessage, toLogError } from '~/utils/error';
import { getNextRunAt } from './cron';

const RUNNER_INTERVAL_MS = 30_000;
const RUNNER_BATCH_SIZE = 20;

let timer: ReturnType<typeof setInterval> | null = null;
let isRunning = false;

function makeSyntheticContext(
  client: WebClient,
  task: ScheduledTask
): SlackMessageContext {
  const ts = `${Math.floor(Date.now() / 1000)}.000000`;
  return {
    client,
    event: {
      channel: task.destinationId,
      channel_type: task.destinationType === 'dm' ? 'im' : 'channel',
      event_ts: ts,
      ts,
      text: task.prompt,
      thread_ts: task.threadTs ?? undefined,
      user: task.creatorUserId,
    },
  };
}

function makeNoopStream(client: WebClient, channel: string): Stream {
  return {
    channel,
    client,
    ts: '',
    tasks: new Map(),
    thought: false,
    noop: true,
  };
}

async function sendFallbackFailureMessage(
  client: WebClient,
  task: ScheduledTask,
  message: string
) {
  try {
    await client.chat.postMessage({
      channel: task.destinationId,
      markdown_text: `Scheduled task failed: ${message}`,
      thread_ts: task.threadTs ?? undefined,
    });
  } catch (error) {
    logger.error(
      { ...toLogError(error), taskId: task.id, channel: task.destinationId },
      'Failed to send scheduled task fallback error message'
    );
  }
}

async function runTask(client: WebClient, task: ScheduledTask): Promise<void> {
  const runAt = new Date();
  let status: 'success' | 'error' = 'success';
  let runError: string | undefined;

  if (!isUserAllowed(task.creatorUserId)) {
    await disableScheduledTask(
      task.id,
      'Task disabled because the creator is no longer allowed to use the bot.'
    );
    return;
  }

  try {
    const context = makeSyntheticContext(client, task);
    const stream = makeNoopStream(client, task.destinationId);
    const agent = scheduledTaskAgent({
      context,
      destination: {
        channelId: task.destinationId,
        threadTs: task.threadTs,
        taskId: task.id,
      },
      stream,
      timezone: task.timezone,
    });

    const streamResult = await agent.stream({
      messages: [{ role: 'user', content: task.prompt }],
    });

    const toolCalls = await streamResult.toolCalls;
    const delivered = Array.isArray(toolCalls)
      ? toolCalls.some(
          (call) =>
            (call as { toolName?: string }).toolName === 'sendScheduledMessage'
        )
      : false;

    if (!delivered) {
      throw new Error(
        'Scheduled task did not deliver output before the run stopped.'
      );
    }
  } catch (error) {
    status = 'error';
    runError = errorMessage(error);
    logger.error(
      { ...toLogError(error), taskId: task.id, cron: task.cronExpression },
      'Scheduled task run failed'
    );
    await sendFallbackFailureMessage(client, task, runError);
  }

  try {
    const nextRunAt = getNextRunAt(task.cronExpression, task.timezone, runAt);
    await completeScheduledTaskRun(task.id, {
      nextRunAt,
      status,
      error: runError,
      runAt,
    });
  } catch (error) {
    const message = `Disabling task due to invalid schedule configuration: ${errorMessage(error)}`;
    logger.error(
      { ...toLogError(error), taskId: task.id, cron: task.cronExpression },
      'Failed to compute next scheduled run'
    );
    await disableScheduledTask(task.id, message);
  }
}

async function sweep(client: WebClient): Promise<void> {
  if (isRunning) {
    return;
  }

  isRunning = true;
  try {
    const due = await listDueScheduledTasks(new Date(), RUNNER_BATCH_SIZE);
    for (const candidate of due) {
      const claimed = await claimScheduledTaskRun(candidate.id, new Date());
      if (!claimed) {
        continue;
      }

      await runTask(client, claimed);
    }
  } finally {
    isRunning = false;
  }
}

export function startScheduledTaskRunner(client: WebClient): void {
  if (timer) {
    return;
  }

  timer = setInterval(() => {
    sweep(client).catch((error) => {
      logger.error(
        { ...toLogError(error) },
        '[scheduled-task-runner] Unexpected error while running sweep'
      );
    });
  }, RUNNER_INTERVAL_MS);
  timer.unref();

  logger.info('[scheduled-task-runner] Started');
}
