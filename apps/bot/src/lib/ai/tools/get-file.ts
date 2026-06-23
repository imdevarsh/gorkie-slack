import nodePath from 'node:path/posix';
import { fetchSlackFile } from '@chat-adapter/slack/api';
import type { SandboxContext } from '@repo/ai';
import { tool } from 'ai';
import { z } from 'zod';
import { env } from '@/env';
import { slack } from '@/lib/chat';
import { sanitizeFilename } from '@/lib/utils/sanitize';

const SLACK_FILE_ID = /(F[A-Z0-9]{6,})/;

export function getFileTool({
  getSandboxContext,
}: {
  getSandboxContext: () => SandboxContext | undefined;
}) {
  return tool({
    description:
      'Download a Slack file into the sandbox workspace so you can read it. Works for uploads, snippets, images, canvases, and any Slack file type. Accepts a Slack file URL, permalink, or file ID.',
    inputSchema: z.object({
      file: z
        .string()
        .min(1)
        .describe('A Slack file URL, permalink, or file ID (e.g. F0123ABCD).'),
      filename: z
        .string()
        .min(1)
        .optional()
        .describe('Optional name to save the file as.'),
    }),
    execute: async ({ file, filename }) => {
      const sandboxContext = getSandboxContext();
      if (!sandboxContext) {
        throw new Error('No active sandbox session is available.');
      }

      const fileId = SLACK_FILE_ID.exec(file)?.[1];
      const info = fileId
        ? (await slack.webClient.files.info({ file: fileId })).file
        : undefined;
      const url =
        info?.url_private_download ??
        info?.url_private ??
        (file.startsWith('http') ? file : undefined);
      if (!url) {
        throw new Error(`Could not resolve a download URL for: ${file}`);
      }

      const response = await fetchSlackFile({
        token: env.SLACK_BOT_TOKEN,
        url,
      });
      if (!response.ok) {
        throw new Error(`Failed to download Slack file: ${response.status}`);
      }
      const bytes = new Uint8Array(await response.arrayBuffer());

      const name =
        sanitizeFilename(filename ?? info?.name ?? fileId ?? 'slack-file') ||
        'slack-file';
      const path = nodePath.join(
        sandboxContext.sessionWorkDir,
        'downloads',
        name
      );
      await sandboxContext.session.writeBinaryFile({ content: bytes, path });

      return {
        filename: name,
        mimeType: info?.mimetype,
        path,
        success: true,
        summary: `Downloaded ${name} to ${path}.`,
      };
    },
  });
}
