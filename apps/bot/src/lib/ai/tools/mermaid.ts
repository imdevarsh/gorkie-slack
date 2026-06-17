import { deflateSync } from 'node:zlib';
import { errorMessage } from '@repo/utils/error';
import { tool } from 'ai';
import type { Thread } from 'chat';
import { z } from 'zod';
import { uploadSlackFileToThread } from '@/lib/slack/thread';

function mermaidImageUrl({ code }: { code: string }): string {
  const payload = JSON.stringify({ code, mermaid: {} });
  const encoded = deflateSync(new TextEncoder().encode(payload))
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
  return `https://mermaid.ink/img/pako:${encoded}?type=png`;
}

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
        const response = await fetch(mermaidImageUrl({ code }));
        if (!response.ok) {
          throw new Error(
            `Mermaid image generation failed: ${response.status}`
          );
        }
        await uploadSlackFileToThread({
          file: Buffer.from(await response.arrayBuffer()),
          filename: 'diagram.png',
          thread,
          title: title ?? 'Mermaid Diagram',
        });
        return { success: true, title: title ?? 'Mermaid Diagram' };
      } catch (error) {
        return { error: errorMessage(error), success: false };
      }
    },
  });
}
