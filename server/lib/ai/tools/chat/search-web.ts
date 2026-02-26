import { tool } from 'ai';
import type { RegularSearchOptions } from 'exa-js';
import { z } from 'zod';
import { exa } from '~/lib/ai/exa';
import { createTask, finishTask, updateTask } from '~/lib/ai/utils/task';
import type { ChatRuntimeContext, Stream, TaskSource } from '~/types';

const EXA_SEARCH_OPTIONS = {
  type: 'auto',
  numResults: 10,
  contents: {
    text: true,
  },
} as const satisfies RegularSearchOptions;

export const searchWeb = ({
  stream,
}: {
  context: ChatRuntimeContext;
  stream: Stream;
}) =>
  tool({
    description:
      'Search the web for code docs, current information, news, articles, and content. Use this when you need up-to-date information or facts from the internet.',
    inputSchema: z.object({
      query: z
        .string()
        .min(1)
        .max(500)
        .describe(
          "The web search query. Be specific and clear about what you're looking for."
        ),
    }),
    onInputStart: async ({ toolCallId }) => {
      await createTask(stream, {
        taskId: toolCallId,
        title: 'Searching the web',
        status: 'pending',
      });
    },
    execute: async ({ query }, { toolCallId }) => {
      const task = await updateTask(stream, {
        taskId: toolCallId,
        title: 'Searching the web',
        details: query,
        status: 'in_progress',
      });

      try {
        const result = await exa.search(query, EXA_SEARCH_OPTIONS);
        const sources: TaskSource[] = result.results
          .map((item) => {
            const url = item.url?.trim();
            if (!url) {
              return undefined;
            }

            return {
              type: 'url',
              text: item.title || url,
              url,
            };
          })
          .filter((source): source is TaskSource => Boolean(source))
          .slice(0, 8);
        await finishTask(stream, {
          status: 'complete',
          taskId: task,
          sources,
          output: `Searched the web for "${query}" and found *${sources.length} source${sources.length === 1 ? '' : 's'}*.`,
        });
        return result;
      } catch (error) {
        await finishTask(stream, { status: 'error', taskId: task });
        throw error;
      }
    },
  });
