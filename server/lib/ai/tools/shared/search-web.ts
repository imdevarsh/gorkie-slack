import { webSearch } from '@exalabs/ai-sdk';
import { createTask, finishTask, updateTask } from '~/lib/ai/utils/task';
import type { SlackMessageContext, Stream } from '~/types';

const baseSearchWeb = webSearch({ numResults: 10, type: 'auto' });

export const searchWeb = ({
  stream,
}: {
  context: SlackMessageContext;
  stream: Stream;
}) => ({
  ...baseSearchWeb,
  onInputStart: async ({ toolCallId }: { toolCallId: string }) => {
    await createTask(stream, {
      taskId: toolCallId,
      title: 'Searching the web',
      status: 'pending',
    });
  },
  execute: baseSearchWeb.execute
    ? async (
        ...args: Parameters<NonNullable<typeof baseSearchWeb.execute>>
      ) => {
        const [, { toolCallId }] = args;
        const task = await updateTask(stream, {
          taskId: toolCallId,
          title: 'Searching the web',
          details: args[0]?.query,
          status: 'in_progress',
        });
        try {
          const result = await (
            baseSearchWeb.execute as NonNullable<typeof baseSearchWeb.execute>
          )(...args);
          await finishTask(stream, task, 'complete');
          return result;
        } catch (err) {
          await finishTask(stream, task, 'error');
          throw err;
        }
      }
    : undefined,
});
