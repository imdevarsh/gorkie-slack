import type { Sandbox } from '@vercel/sandbox';
import { env } from '~/env';
import logger from '~/lib/logger';
import type { SlackFile } from '~/utils/images';

export const ATTACHMENTS_DIR = 'attachments';

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

export async function transportAttachments(
  sandbox: Sandbox,
  messageTs: string,
  files: SlackFile[]
): Promise<void> {
  const dir = `${ATTACHMENTS_DIR}/${messageTs}`;
  await sandbox.runCommand({ cmd: 'mkdir', args: ['-p', dir] });

  await Promise.all(
    files.map(async (file) => {
      const content = await download(file);
      if (!content) {
        logger.warn(
          { fileId: file.id, name: file.name },
          'Failed to download attachment'
        );
        return;
      }

      await sandbox.writeFiles([{ path: `${dir}/${file.name}`, content }]);
    })
  );

  logger.info(
    { count: files.length, messageTs },
    'Transported attachments to sandbox'
  );
}
