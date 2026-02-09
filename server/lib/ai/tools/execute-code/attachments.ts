import type { Sandbox } from '@vercel/sandbox';
import { env } from '~/env';
import logger from '~/lib/logger';
import type { SlackFile } from '~/utils/images';

const ATTACHMENTS_DIR = 'attachments';

export interface SandboxFile {
  path: string;
  mimetype: string;
}

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

export async function prepareAttachments(
  sandbox: Sandbox,
  messageTs: string,
  files: SlackFile[] | undefined
): Promise<SandboxFile[]> {
  if (!files || files.length === 0) {
    return [];
  }

  const dir = `${ATTACHMENTS_DIR}/${messageTs}`;
  await sandbox.runCommand({ cmd: 'mkdir', args: ['-p', dir] });

  const results = await Promise.all(
    files.map(async (file): Promise<SandboxFile | null> => {
      const content = await download(file);
      if (!content) {
        logger.warn(
          { fileId: file.id, name: file.name },
          'Failed to download attachment'
        );
        return null;
      }

      const path = `${dir}/${file.name}`;
      await sandbox.writeFiles([{ path, content }]);

      return {
        path,
        mimetype: file.mimetype ?? 'application/octet-stream',
      };
    })
  );

  const transported = results.filter((r): r is SandboxFile => r !== null);

  if (transported.length > 0) {
    logger.info(
      { count: transported.length, messageTs },
      'Transported attachments to sandbox'
    );
  }

  return transported;
}
