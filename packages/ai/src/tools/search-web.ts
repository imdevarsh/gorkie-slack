import { tool } from 'ai';
import Exa from 'exa-js';
import { z } from 'zod';

export function searchWeb({ apiKey }: { apiKey: string }) {
  const exa = new Exa(apiKey);
  return tool({
    description:
      'Search the web for current information, documentation, news, and facts. Use it when you need up-to-date information rather than guessing.',
    inputSchema: z.object({
      query: z
        .string()
        .min(1)
        .max(500)
        .describe("A specific, clear web search query for what you're after."),
    }),
    execute: async ({ query }) => {
      const { results } = await exa.searchAndContents(query, {
        type: 'auto',
        numResults: 8,
        text: { maxCharacters: 1200 },
      });
      return {
        results: results.map((result) => ({
          title: result.title ?? result.url,
          url: result.url,
          text: result.text ?? '',
          publishedDate: result.publishedDate,
        })),
      };
    },
  });
}
