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
        const workspacePath = nodePath.resolve(sessionWorkDir);
        const sandboxPath = nodePath.resolve(
          nodePath.isAbsolute(path) ? path : nodePath.join(workspacePath, path)
        );

        const channelId = context.event.channel;
        const threadTs = context.event.thread_ts;
        const messageTs = context.event.ts;
        if (!channelId) {
          return { uploaded: false, path, reason: 'missing Slack channel' };
        }

        const fail = async ({
          reason,
          text,
        }: {
          reason: string;
          text: string;
        }) => {
          await postThreadError({
            context,
            channelId,
            threadTs,
            messageTs,
            text,
          });
          return { uploaded: false, path, reason };
        };

        const outsideWorkspace =
          sandboxPath !== workspacePath &&
          !sandboxPath.startsWith(`${workspacePath}/`);
        if (outsideWorkspace) {
          logger.warn(
            { path: sandboxPath, workspacePath, ctxId },
            '[sandbox] showFile: path escapes workspace'
          );
          return fail({
            reason: 'path outside sandbox workspace',
            text: `showFile failed: \`${path}\` is outside the sandbox workspace.`,
          });
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
          return fail({
            reason: 'file not found',
            text: `showFile failed: could not find \`${path}\` in sandbox.`,
          });
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
          return fail({
            reason: cause,
            text: `showFile failed while uploading \`${filename}\`: ${cause}`,
          });
        }
      },
    }),
  };
}
