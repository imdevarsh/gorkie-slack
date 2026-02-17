import nodePath from 'node:path';
import type { Sandbox } from '@daytonaio/sdk';
import { sandbox as config } from '~/config';
import logger from '~/lib/logger';
import type { SlackMessageContext } from '~/types';

export interface UploadedDisplayFile {
  path: string;
  filename: string;
  bytes: number;
}

const DISPLAY_DIR = `${config.runtime.workdir}/output/display`;

interface UploadRuntime {
  sandbox: Sandbox;
}

export async function uploadFiles(
  runtime: UploadRuntime,
  context: SlackMessageContext
): Promise<UploadedDisplayFile[]> {
  const channelId = (context.event as { channel?: string }).channel;
  const threadTs = (context.event as { thread_ts?: string }).thread_ts;
  const messageTs = context.event.ts;

  if (!channelId) {
    return [];
  }

  const entries = await runtime.sandbox.fs
    .listFiles(DISPLAY_DIR)
    .catch(() => []);

  const uploaded: UploadedDisplayFile[] = [];

  for (const entry of entries) {
    if (entry.isDir) {
      continue;
    }

    const entryPath = nodePath.posix.join(DISPLAY_DIR, entry.name);

    const file = await runtime.sandbox.fs
      .downloadFile(entryPath)
      .catch(() => null);
    if (!file) {
      continue;
    }

    const filename = nodePath.basename(entryPath) || 'artifact';

    const uploadOk = await context.client.files
      .uploadV2({
        channel_id: channelId,
        thread_ts: threadTs ?? messageTs,
        file: Buffer.from(file),
        filename,
        title: filename,
      })
      .then(() => true)
      .catch((error: unknown) => {
        logger.warn(
          { error, path: entryPath },
          '[sandbox] Failed to upload display artifact'
        );
        return false;
      });

    if (!uploadOk) {
      continue;
    }

    uploaded.push({
      path: entryPath,
      filename,
      bytes: file.byteLength,
    });

    await runtime.sandbox.fs.deleteFile(entryPath).catch((error: unknown) => {
      logger.warn(
        { error, path: entryPath },
        '[sandbox] Failed to cleanup uploaded artifact'
      );
    });
  }

  return uploaded;
}
