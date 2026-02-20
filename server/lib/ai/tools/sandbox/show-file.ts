import nodePath from 'node:path';
import { tool } from 'ai';
import { z } from 'zod';
import logger from '~/lib/logger';
import { getContextId } from '~/utils/context';
import { errorMessage, toLogError } from '~/utils/error';
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
      const ctxId = getContextId(context);
      logger.info(
        {
          ctxId,
          input: { filePath, filename: filename ?? null, description },
        },
        '[subagent] uploading file'
      );

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

        const output = {
          success: true,
          filePath,
          filename: uploadName,
          bytes: bytes.byteLength,
        };

        logger.info(
          {
            ctxId,
            output,
          },
          '[subagent] show file'
        );

        return output;
      } catch (error) {
        logger.warn(
          {
            ctxId,
            output: {
              success: false,
              error: errorMessage(error),
            },
          },
          '[subagent] show file'
        );

        logger.error(
          { ...toLogError(error), ctxId, filePath },
          '[sandbox-tool] Failed to upload file to Slack'
        );

        return {
          success: false,
          error: errorMessage(error),
        };
      }
    },
  });
