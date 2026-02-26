import { tool } from 'ai';
import { z } from 'zod';
import { createTask } from '~/lib/ai/utils/task';
import type { SlackFile, SlackMessageContext, Stream } from '~/types';
import { runSandboxTask } from './sandbox-runner';

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
    execute: ({ task }, { toolCallId }) => {
      return runSandboxTask({
        context,
        files,
        stream,
        task,
        toolCallId,
      });
    },
  });
