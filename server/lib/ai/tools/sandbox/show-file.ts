import nodePath from 'node:path';
import { tool } from 'ai';
import { z } from 'zod';
import { createTask, finishTask, updateTask } from '~/lib/ai/utils/task';
import logger from '~/lib/logger';
import { getContextId } from '~/utils/context';
import { errorMessage, toLogError } from '~/utils/error';
import type { SandboxToolDeps } from './_shared';

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 ** 2) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  if (bytes < 1024 ** 3) {
    return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  }
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

export const showFile = ({ context, sandbox, stream }: SandboxToolDeps) =>
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
        .default('Uploading files')
        .describe(
          'Brief title for this operation, e.g. "Uploading chart.png", "Sharing report.pdf".'
        ),
    }),
    onInputStart: async ({ toolCallId }) => {
      await createTask(stream, {
        taskId: toolCallId,
        title: 'Uploading files',
        status: 'pending',
      });
    },
    execute: async ({ filePath, filename, description }, { toolCallId }) => {
      const ctxId = getContextId(context);
      const task = await updateTask(stream, {
        taskId: toolCallId,
        title: description,
        details: filePath,
        status: 'in_progress',
      });
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
        await finishTask(stream, task, 'error', 'Missing Slack channel ID');
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

        await finishTask(
          stream,
          task,
          'complete',
          `Uploaded ${output.filename} (${formatBytes(output.bytes)})`
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

        await finishTask(stream, task, 'error', errorMessage(error));
        return {
          success: false,
          error: errorMessage(error),
        };
      }
    },
  });
