import nodePath from 'node:path/posix';
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
  sessionWorkDir,
}: {
  context: SlackMessageContext;
  ctxId: string;
  sessionWorkDir: string;
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
        const sandboxPath = nodePath.isAbsolute(path)
          ? path
          : nodePath.join(sessionWorkDir, path);

        const channelId = context.event.channel;
        const threadTs = context.event.thread_ts;
        const messageTs = context.event.ts;
        if (!channelId) {
          return { uploaded: false, path, reason: 'missing Slack channel' };
        }

        const relativePath = nodePath.relative(sessionWorkDir, sandboxPath);
        if (
          relativePath !== '' &&
          (relativePath === '..' || relativePath.startsWith('../'))
        ) {
          logger.warn(
            { path: sandboxPath, sessionWorkDir, ctxId },
            '[sandbox] showFile: path escapes workspace'
          );
          await postThreadError({
            context,
            channelId,
            threadTs,
            messageTs,
            text: `showFile failed: \`${path}\` is outside the sandbox workspace.`,
          });
          return {
            uploaded: false,
            path,
            reason: 'path outside sandbox workspace',
          };
        }

        const file = experimental_sandbox
          ? await Promise.resolve(
              experimental_sandbox.readBinaryFile({ path: sandboxPath })
            ).catch(() => null)
          : null;
        if (!file) {
          logger.warn(
            { path: sandboxPath, ctxId },
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

        const filename = nodePath.basename(sandboxPath) || 'artifact';

        try {
          await context.client.files.uploadV2({
            channel_id: channelId,
            thread_ts: threadTs ?? messageTs,
            file: Buffer.from(file),
            filename,
            title: title ?? filename,
          });
          logger.info(
            { path: sandboxPath, filename, ctxId },
            '[sandbox] showFile: uploaded to Slack'
          );
          return { uploaded: true, path, title: title ?? filename };
        } catch (error) {
          const cause = errorMessage(error).slice(0, 140);
          logger.warn(
            { ...toLogError(error), path: sandboxPath, ctxId },
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
