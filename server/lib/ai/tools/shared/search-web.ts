import { webSearch } from '@exalabs/ai-sdk';
import { createTask, finishTask } from '~/lib/ai/utils/task';
import type { SlackMessageContext, Stream } from '~/types';

const baseSearchWeb = webSearch({ numResults: 10, type: 'auto' });

export const searchWeb = ({
  stream,
}: {
  context: SlackMessageContext;
  stream: Stream;
}) => ({
  ...baseSearchWeb,
  execute: baseSearchWeb.execute
    ? async (
      ...args: Parameters<NonNullable<typeof baseSearchWeb.execute>>
    ) => {
      const task = await createTask(stream, {
        title: 'Searching the web',
        details: args[0]?.query,
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
