import { tool } from 'ai';
import { z } from 'zod';
import { setToolStatus } from '~/lib/ai/utils';
import logger from '~/lib/logger';
import type { SlackMessageContext } from '~/types';
import { getContextId } from '~/utils/context';
import { getOrCreate } from './execute-code/sandbox';

export const showFile = ({ context }: { context: SlackMessageContext }) =>
  tool({
    description:
      'Show a file from the sandbox to the user in Slack. Use after generating files with executeCode.',
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
      await setToolStatus(context, 'is reading file from sandbox');
      const channelId = (context.event as { channel?: string }).channel;
      const threadTs = (context.event as { thread_ts?: string }).thread_ts;
      const messageTs = context.event.ts;
      const ctxId = getContextId(context);

      if (!channelId) {
        return { success: false, error: 'Missing Slack channel' };
      }

      try {
        const sandbox = await getOrCreate(ctxId);
        const fileBuffer = await sandbox.readFileToBuffer({ path });

        if (!fileBuffer) {
          return { success: false, error: `File not found: ${path}` };
        }

        await setToolStatus(context, 'is uploading file');
        const uploadFilename = filename ?? path.split('/').pop() ?? 'file';

        await context.client.files.uploadV2({
          channel_id: channelId,
          thread_ts: threadTs ?? messageTs,
          file: fileBuffer,
          filename: uploadFilename,
          title: title ?? uploadFilename,
        });

        logger.info(
          { channel: channelId, path, size: fileBuffer.length },
          'Uploaded sandbox file to Slack'
        );

        return {
          success: true,
          message: `Uploaded ${uploadFilename} (${fileBuffer.length} bytes) to Slack`,
        };
      } catch (error) {
        logger.error(
          { error, channel: channelId, path },
          'Failed to upload sandbox file'
        );
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });
