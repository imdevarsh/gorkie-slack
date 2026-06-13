import nodePath from 'node:path';
import { type ToolSet, tool } from '@ai-sdk/provider-utils';
import { errorMessage, toLogError } from '@repo/utils/error';
import { showFileInputSchema } from '@repo/validators';
import { z } from 'zod';
import logger from '@/lib/logger';
import type { SlackMessageContext } from '@/types';

async function postThreadError({
  channelId,
  context,
  messageTs,
  text,
  threadTs,
}: {
  channelId: string;
  context: SlackMessageContext;
  messageTs: string | undefined;
  text: string;
  threadTs: string | undefined;
}): Promise<void> {
  await context.client.chat
    .postMessage({
      channel: channelId,
      thread_ts: threadTs ?? messageTs,
      text,
    })
    .catch(() => null);
}

export function createSandboxTools({
  context,
  ctxId,
}: {
  context: SlackMessageContext;
  ctxId: string;
}): ToolSet {
  return {
    showFile: tool({
      description:
        'Upload a file from the sandbox workspace to the current Slack thread.',
      inputSchema: showFileInputSchema.extend({
        status: z
          .string()
          .optional()
          .describe(
            "Brief operation status in present-progressive form, e.g. 'uploading file'."
          ),
      }),
      execute: async ({ path, title }, { experimental_sandbox }) => {
        if (!nodePath.isAbsolute(path)) {
          throw new Error('showFile.path must be absolute');
        }

        const channelId = context.event.channel;
        const threadTs = context.event.thread_ts;
        const messageTs = context.event.ts;
        if (!channelId) {
          return { uploaded: false, path, reason: 'missing Slack channel' };
        }

        const file = experimental_sandbox
          ? await Promise.resolve(
              experimental_sandbox.readBinaryFile({ path })
            ).catch(() => null)
          : null;
        if (!file) {
          logger.warn(
            { path, ctxId },
            '[sandbox] showFile: file not found in sandbox'
          );
          await postThreadError({
            context,
            channelId,
            threadTs,
            messageTs,
            text: `showFile failed: could not find \`${path}\` in sandbox.`,
          });
          return { uploaded: false, path, reason: 'file not found' };
        }

        const filename = nodePath.basename(path) || 'artifact';

        try {
          await context.client.files.uploadV2({
            channel_id: channelId,
            thread_ts: threadTs ?? messageTs,
            file: Buffer.from(file),
            filename,
            title: title ?? filename,
          });
          logger.info(
            { path, filename, ctxId },
            '[sandbox] showFile: uploaded to Slack'
          );
          return { uploaded: true, path, title: title ?? filename };
        } catch (error) {
          const cause = errorMessage(error).slice(0, 140);
          logger.warn(
            { ...toLogError(error), path, ctxId },
            '[sandbox] showFile: failed to upload to Slack'
          );
          await postThreadError({
            context,
            channelId,
            threadTs,
            messageTs,
            text: `showFile failed while uploading \`${filename}\`: ${cause}`,
          });
          return { uploaded: false, path, reason: cause };
        }
      },
    }),
  };
}
