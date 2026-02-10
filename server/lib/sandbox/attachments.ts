import type { Sandbox } from '@vercel/sandbox';
import { env } from '~/env';
import logger from '~/lib/logger';
import type { SlackFile } from '~/utils/images';
import { attachmentsDir } from './paths';
import type { SandboxAttachments } from './types';

export const ATTACHMENTS_DIR = 'attachments';

const syncedAttachments = new Set<string>();

export async function syncAttachments(
  sandbox: Sandbox,
  ctxId: string,
  attachments?: SandboxAttachments
): Promise<void> {
  if (!attachments?.files.length) {
    return;
  }

  const key = `${ctxId}:${attachments.messageTs}`;
  if (syncedAttachments.has(key)) {
    return;
  }

  const dir = attachmentsDir(attachments.messageTs);
  await sandbox.runCommand({ cmd: 'mkdir', args: ['-p', dir] });

  await Promise.all(
    attachments.files.map(async (file) => {
      const content = await download(file);
      if (!content) {
        logger.warn(
          { fileId: file.id, name: file.name },
          'Failed to download attachment'
        );
        return;
      }

      const safeName = file.name.split('/').pop() ?? file.name;
      await sandbox.writeFiles([{ path: `${dir}/${safeName}`, content }]);
    })
  );

  logger.info(
    { count: attachments.files.length, messageTs: attachments.messageTs },
    'Transported attachments to sandbox'
  );
  syncedAttachments.add(key);

  async function download(file: SlackFile): Promise<Buffer | null> {
    const url = file.url_private ?? file.url_private_download;
    if (!url) {
      return null;
    }

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${env.SLACK_BOT_TOKEN}` },
    }).catch(() => null);

    if (!response?.ok) {
      return null;
    }

    return Buffer.from(await response.arrayBuffer());
  }
}
