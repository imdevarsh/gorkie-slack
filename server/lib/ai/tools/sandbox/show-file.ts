import nodePath from 'node:path';
import { tool } from 'ai';
import { z } from 'zod';
import { setStatus } from '~/lib/ai/utils/status';
import logger from '~/lib/logger';
import { getSandbox } from '~/lib/sandbox';
import { sandboxPath } from '~/lib/sandbox/paths';
import type { SlackMessageContext } from '~/types';
import { getContextId } from '~/utils/context';

export const showFile = ({ context }: { context: SlackMessageContext }) =>
  tool({
    description:
      'Upload a file from the sandbox to Slack so the user can see or download it.',
    inputSchema: z.object({
      path: z
        .string()
        .describe('File path in sandbox (e.g. output.png, report.csv)'),
      filename: z
        .string()
        .optional()
        .describe('Filename for the Slack upload (defaults to basename)'),
      title: z
        .string()
        .optional()
        .describe('Title or description for the file'),
    }),
    execute: async ({ path, filename, title }) => {
      const channelId = (context.event as { channel?: string }).channel;
      const threadTs = (context.event as { thread_ts?: string }).thread_ts;
      const messageTs = context.event.ts;
      const ctxId = getContextId(context);
      const resolvedPath = sandboxPath(path);

      if (!channelId) {
        return { success: false, error: 'Missing Slack channel' };
      }

      try {
        const sandbox = await getSandbox(context);
        await setStatus(context, {
          status: 'is uploading a file',
          loading: true,
        });

        const fileBuffer = await sandbox.readFileToBuffer({
          path: resolvedPath,
        });

        if (!fileBuffer) {
          return { success: false, error: `File not found: ${resolvedPath}` };
        }

        const uploadFilename = filename ?? (nodePath.basename(path) || 'file');

        await context.client.files.uploadV2({
          channel_id: channelId,
          thread_ts: threadTs ?? messageTs,
          file: fileBuffer,
          filename: uploadFilename,
          title: title ?? uploadFilename,
        });

        logger.info(
          {
            channel: channelId,
            path: resolvedPath,
            size: fileBuffer.length,
            ctxId,
          },
          '[sandbox] [show_file] ok'
        );

        return {
          success: true,
          message: `Uploaded ${uploadFilename} (${fileBuffer.length} bytes) to Slack`,
        };
      } catch (error) {
        logger.error(
          { error, channel: channelId, path, ctxId },
          '[sandbox] [show_file] fail'
        );
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });
