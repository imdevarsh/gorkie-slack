import nodePath from 'node:path';
import type { Sandbox } from '@daytonaio/sdk';
import type { SandboxAgent } from 'sandbox-agent';
import logger from '~/lib/logger';
import type { SlackMessageContext } from '~/types';
import { sandbox as config } from '~/config';

export interface UploadedDisplayFile {
  path: string;
  filename: string;
  bytes: number;
}

const DISPLAY_DIR = `${config.runtime.workdir}/output/display`;

interface UploadRuntime {
  sdk: SandboxAgent;
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

  const entries = await runtime.sdk
    .listFsEntries({ path: DISPLAY_DIR })
    .catch(() => []);

  const uploaded: UploadedDisplayFile[] = [];

  for (const entry of entries) {
    if (entry.entryType !== 'file') {
      continue;
    }

    const file = await runtime.sdk
      .readFsFile({ path: entry.path })
      .catch(() => null);
    if (!file) {
      continue;
    }

    const filename = nodePath.basename(entry.path) || 'artifact';

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
          { error, path: entry.path },
          '[sandbox] Failed to upload display artifact'
        );
        return false;
      });

    if (!uploadOk) {
      continue;
    }

    uploaded.push({
      path: entry.path,
      filename,
      bytes: file.byteLength,
    });

    await runtime.sandbox.fs.deleteFile(entry.path).catch((error: unknown) => {
      logger.warn(
        { error, path: entry.path },
        '[sandbox] Failed to cleanup uploaded artifact'
      );
    });
  }

  return uploaded;
}
