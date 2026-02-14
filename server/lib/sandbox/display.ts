import nodePath from 'node:path';
import type { SandboxAgent } from 'sandbox-agent';
import logger from '~/lib/logger';
import type { SlackMessageContext } from '~/types';

export interface UploadedDisplayFile {
  path: string;
  filename: string;
  bytes: number;
}

const DISPLAY_DIR = 'output/display';

export async function uploadDisplayFiles(
  sdk: SandboxAgent,
  context: SlackMessageContext
): Promise<UploadedDisplayFile[]> {
  const channelId = (context.event as { channel?: string }).channel;
  const threadTs = (context.event as { thread_ts?: string }).thread_ts;
  const messageTs = context.event.ts;

  if (!channelId) {
    return [];
  }

  const entries = await sdk
    .listFsEntries({ path: DISPLAY_DIR })
    .catch(() => []);

  const uploaded: UploadedDisplayFile[] = [];

  for (const entry of entries) {
    if (entry.entryType !== 'file') {
      continue;
    }

    const file = await sdk.readFsFile({ path: entry.path }).catch(() => null);
    if (!file) {
      continue;
    }

    const filename = nodePath.basename(entry.path) || 'artifact';

    await context.client.files
      .uploadV2({
        channel_id: channelId,
        thread_ts: threadTs ?? messageTs,
        file: Buffer.from(file),
        filename,
        title: filename,
      })
      .catch((error: unknown) => {
        logger.warn(
          { error, path: entry.path },
          '[sandbox] Failed to upload display artifact'
        );
      });

    uploaded.push({
      path: entry.path,
      filename,
      bytes: file.byteLength,
    });
  }

  return uploaded;
}
