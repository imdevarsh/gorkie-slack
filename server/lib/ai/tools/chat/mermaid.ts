import { tool } from 'ai';
import { deflate } from 'pako';
import { z } from 'zod';
import { setStatus } from '~/lib/ai/utils/status';
import logger from '~/lib/logger';
import type { SlackMessageContext } from '~/types';
import { errorMessage, toLogError } from '~/utils/error';

const PLUS_REGEX = /\+/g;
const SLASH_REGEX = /\//g;
const EQUALS_REGEX = /=+$/;

function getMermaidImageUrl(code: string) {
  const payload = {
    code,
    mermaid: {},
  };

  const text = JSON.stringify(payload);
  const utf8Bytes = new TextEncoder().encode(text);

  const compressed = deflate(utf8Bytes);

  let binary = '';
  const bytes = new Uint8Array(compressed);
  for (const byte of bytes) {
    binary += String.fromCharCode(byte ?? 0);
  }
  let base64 = btoa(binary);

  base64 = base64
    .replace(PLUS_REGEX, '-')
    .replace(SLASH_REGEX, '_')
    .replace(EQUALS_REGEX, '');

  return `https://mermaid.ink/img/pako:${base64}?type=png`;
}

export const mermaid = ({ context }: { context: SlackMessageContext }) =>
  tool({
    description:
      'Generate a Mermaid diagram and share it as an image in Slack. Use for visualizing workflows, architectures, sequences, or relationships.',
    inputSchema: z.object({
      code: z
        .string()
        .describe(
          'Valid Mermaid diagram code (flowchart, sequence, classDiagram, etc.)'
        ),
      title: z
        .string()
        .optional()
        .describe('Optional title/alt text for the diagram'),
    }),
    execute: async ({ code, title }) => {
      await setStatus(context, {
        status: 'is generating a diagram',
        loading: true,
      });
      const channelId = (context.event as { channel?: string }).channel;
      const threadTs = (context.event as { thread_ts?: string }).thread_ts;
      const messageTs = context.event.ts;

      if (!channelId) {
        logger.warn(
          { title },
          'Failed to create Mermaid diagram: missing channel'
        );
        return { success: false, error: 'Missing Slack channel' };
      }

      try {
        const imageUrl = getMermaidImageUrl(code);

        const response = await fetch(imageUrl);
        if (!response.ok) {
          throw new Error(`Failed to generate diagram: ${response.statusText}`);
        }

        const imageBuffer = await response.arrayBuffer();

        await context.client.files.uploadV2({
          channel_id: channelId,
          thread_ts: threadTs ?? messageTs,
          file: Buffer.from(imageBuffer),
          filename: 'diagram.png',
          title: title ?? 'Mermaid Diagram',
        });

        logger.info({ channel: channelId, title }, 'Uploaded Mermaid diagram');

        return {
          success: true,
          content: 'Mermaid diagram uploaded to Slack and sent',
        };
      } catch (error) {
        logger.error(
          { ...toLogError(error), channel: channelId },
          'Failed to create Mermaid diagram'
        );
        return {
          success: false,
          error: errorMessage(error),
        };
      }
    },
  });
