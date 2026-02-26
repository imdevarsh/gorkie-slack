import nodePath from 'node:path';
import logger from '~/lib/logger';
import type { SlackMessageContext } from '~/types';
import type { ResolvedSandboxSession } from './session';

export interface ShowFileInput {
  path: string;
  title?: string;
}

export async function showFile(params: {
  input: ShowFileInput;
  runtime: ResolvedSandboxSession;
  context: SlackMessageContext;
  ctxId: string;
}): Promise<void> {
  const { input, runtime, context, ctxId } = params;

  const channelId = (context.event as { channel?: string }).channel;
  const threadTs = (context.event as { thread_ts?: string }).thread_ts;
  const messageTs = context.event.ts;

  if (!channelId) {
    return;
  }

  const file = await runtime.sandbox.files
    .read(input.path, { format: 'bytes' })
    .catch(() => null);
  if (!file) {
    logger.warn(
      { path: input.path, ctxId },
      '[subagent] showFile: file not found in sandbox'
    );
    return;
  }

  const filename = nodePath.basename(input.path) || 'artifact';

  try {
    await context.client.files.uploadV2({
      channel_id: channelId,
      thread_ts: threadTs ?? messageTs,
      file: Buffer.from(file),
      filename,
      title: input.title ?? filename,
    });
    logger.info(
      { path: input.path, filename, ctxId },
      '[subagent] showFile: uploaded to Slack'
    );
  } catch (error) {
    logger.warn(
      { error, path: input.path, ctxId },
      '[subagent] showFile: failed to upload to Slack'
    );
  }
}
