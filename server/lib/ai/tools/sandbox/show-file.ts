import nodePath from 'node:path';
import { tool } from 'ai';
import { z } from 'zod';
import logger from '~/lib/logger';
import { type SandboxToolDeps, setToolStatus } from './_shared';

export const showFile = ({ context, sandbox }: SandboxToolDeps) =>
  tool({
    description:
      'Upload a file from the sandbox directly to Slack thread. Use this for every user-visible artifact.',
    inputSchema: z.object({
      filePath: z
        .string()
        .min(1)
        .describe('Absolute path of the file to upload from sandbox.'),
      filename: z
        .string()
        .optional()
        .describe('Optional upload filename. Defaults to basename(filePath).'),
      description: z
        .string()
        .min(4)
        .max(80)
        .default('is uploading files')
        .describe('Status text in format: is <doing something>.'),
    }),
    execute: async ({ filePath, filename, description }) => {
      await setToolStatus(context, description);

      const channelId = (context.event as { channel?: string }).channel;
      const threadTs =
        (context.event as { thread_ts?: string }).thread_ts ?? context.event.ts;

      if (!channelId) {
        return {
          success: false,
          error: 'Missing Slack channel ID',
        };
      }

      try {
        const bytes = await sandbox.files.read(filePath, { format: 'bytes' });
        const uploadName =
          filename?.trim() || nodePath.basename(filePath) || 'artifact';

        await context.client.files.uploadV2({
          channel_id: channelId,
          thread_ts: threadTs,
          file: Buffer.from(bytes),
          filename: uploadName,
          title: uploadName,
        });

        return {
          success: true,
          filePath,
          filename: uploadName,
          bytes: bytes.byteLength,
        };
      } catch (error) {
        logger.error(
          { error, filePath },
          '[sandbox-tool] Failed to upload file to Slack'
        );

        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });
