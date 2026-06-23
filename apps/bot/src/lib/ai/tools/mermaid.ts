import { deflateSync } from 'node:zlib';
import { tool } from 'ai';
import type { Thread } from 'chat';
import { z } from 'zod';
import { errorMessage } from '@/lib/utils/error';

export function mermaidTool({ thread }: { thread: Thread }) {
  return tool({
    description:
      'Generate a Mermaid diagram and upload it as an image to the current Slack thread. Use for workflows, architectures, sequences, and relationships.',
    inputSchema: z.object({
      code: z
        .string()
        .min(1)
        .max(10_000)
        .describe('Valid Mermaid diagram code.'),
      title: z
        .string()
        .min(1)
        .max(120)
        .optional()
        .describe('Optional title for the uploaded diagram.'),
    }),
    execute: async ({ code, title }) => {
      try {
        const response = await fetch(
          `https://mermaid.ink/img/pako:${deflateSync(
            new TextEncoder().encode(JSON.stringify({ code, mermaid: {} }))
          )
            .toString('base64')
            .replaceAll('+', '-')
            .replaceAll('/', '_')
            .replace(/=+$/, '')}?type=png`
        );
        if (!response.ok) {
          throw new Error(
            `Mermaid image generation failed: ${response.status}`
          );
        }
        await thread.post({
          files: [
            {
              data: Buffer.from(await response.arrayBuffer()),
              filename: 'diagram.png',
            },
          ],
          markdown: title ?? 'Mermaid Diagram',
        });
        return { success: true, title: title ?? 'Mermaid Diagram' };
      } catch (error) {
        return { error: errorMessage(error), success: false };
      }
    },
  });
}
