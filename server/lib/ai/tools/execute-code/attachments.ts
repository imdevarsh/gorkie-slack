import type { Sandbox } from '@vercel/sandbox';
import { env } from '~/env';
import logger from '~/lib/logger';
import type { SlackFile } from '~/utils/images';

const ATTACHMENTS_DIR = '/attachments';

export interface TransportedFile {
  name: string;
  path: string;
  mimetype: string;
}

async function downloadSlackFile(file: SlackFile): Promise<Buffer | null> {
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
): Promise<TransportedFile[]> {
  if (files.length === 0) {
    return [];
  }

  const dir = `${ATTACHMENTS_DIR}/${messageTs}`;
  await sandbox.runCommand({ cmd: 'mkdir', args: ['-p', dir] });

  const results = await Promise.all(
    files.map(async (file): Promise<TransportedFile | null> => {
      const content = await downloadSlackFile(file);
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
        name: file.name,
        path,
        mimetype: file.mimetype ?? 'application/octet-stream',
      };
    })
  );

  const transported = results.filter((r): r is TransportedFile => r !== null);

  if (transported.length > 0) {
    logger.info(
      { count: transported.length, messageTs },
      'Transported attachments to sandbox'
    );
  }

  return transported;
}

export function formatAttachmentContext(files: TransportedFile[]): string {
  if (files.length === 0) {
    return '';
  }

  const listing = files.map((f) => `  - ${f.path} (${f.mimetype})`).join('\n');

  return [
    `\nAttachments available in sandbox:\n${listing}`,
    'Clean up attachments with `rm -rf /attachments/<messageTs>` after use to save space.',
  ].join('\n');
}
