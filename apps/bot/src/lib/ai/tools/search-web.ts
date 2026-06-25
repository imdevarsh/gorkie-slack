import { tool } from 'ai';
import Exa from 'exa-js';
import { z } from 'zod';

export function searchWebTool({ apiKey }: { apiKey: string }) {
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
      const { results } = await exa.search(query, {
        type: 'auto',
        numResults: 8,
        contents: { text: { maxCharacters: 1200 } },
      });
      const links = results.slice(0, 5).map((result) => result.url);
      return {
        links,
        resultCount: results.length,
        results: results.map((result) => ({
          title: result.title ?? result.url,
          url: result.url,
          text: result.text ?? '',
          publishedDate: result.publishedDate,
        })),
        summary:
          results.length === 0
            ? `Search web found no results for "${query}".`
            : `Search web found ${results.length} result${results.length === 1 ? '' : 's'} for "${query}". Top links: ${links.join(', ')}`,
      };
    },
  });
}
