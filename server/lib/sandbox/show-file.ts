import nodePath from 'node:path';
import logger from '~/lib/logger';
import type {
  ResolvedSandboxSession,
  ShowFileInput,
  SlackMessageContext,
} from '~/types';
import { errorMessage, toLogError } from '~/utils/error';
import { contextChannel, contextThreadTs } from '~/utils/slack-event';

async function postThreadError(
  context: SlackMessageContext,
  channelId: string,
  threadTs: string | undefined,
  messageTs: string | undefined,
  text: string
): Promise<void> {
  await context.client.chat
    .postMessage({
      channel: channelId,
      thread_ts: threadTs ?? messageTs,
      text,
    })
    .catch(() => null);
}

export async function showFile(params: {
  input: ShowFileInput;
  runtime: ResolvedSandboxSession;
  context: SlackMessageContext;
  ctxId: string;
}): Promise<void> {
  const { input, runtime, context, ctxId } = params;

  const channelId = contextChannel(context);
  const threadTs = contextThreadTs(context);
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
    await postThreadError(
      context,
      channelId,
      threadTs,
      messageTs,
      `showFile failed: could not find \`${input.path}\` in sandbox.`
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
    const cause = errorMessage(error).slice(0, 140);
    logger.warn(
      { ...toLogError(error), path: input.path, ctxId },
      '[subagent] showFile: failed to upload to Slack'
    );
    await postThreadError(
      context,
      channelId,
      threadTs,
      messageTs,
      `showFile failed while uploading \`${filename}\`: ${cause}`
    );
  }
}
