import path from 'node:path';
import type { Sandbox } from '@vercel/sandbox';
import sanitizeFilename from 'sanitize-filename';
import { env } from '~/env';
import logger from '~/lib/logger';
import type { SlackFile } from '~/utils/images';
import { attachmentsDir } from './paths';
import type { SandboxAttachments } from './types';

export const ATTACHMENTS_DIR = 'attachments';

const syncedAttachments = new Set<string>();
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

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

  const results = await Promise.all(
    attachments.files.map(async (file) => {
      const content = await download(file);
      if (!content) {
        return { file, ok: false };
      }

      const safeName = sanitizeFileName(file);
      try {
        await sandbox.writeFiles([{ path: `${dir}/${safeName}`, content }]);
        return { file, ok: true };
      } catch (error) {
        logger.warn(
          { error, fileId: file.id, name: file.name },
          'Failed to write attachment to sandbox'
        );
        return { file, ok: false };
      }
    })
  );

  const failures = results.filter((result) => !result.ok);
  if (failures.length > 0) {
    logger.warn(
      {
        failed: failures.map((failure) => ({
          fileId: failure.file.id,
          name: failure.file.name,
        })),
        messageTs: attachments.messageTs,
      },
      'Attachment sync incomplete; will retry on next request'
    );
    return;
  }

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

    if (typeof file.size === 'number' && file.size > MAX_ATTACHMENT_BYTES) {
      logger.warn(
        { fileId: file.id, name: file.name, size: file.size },
        'Attachment exceeds size limit'
      );
      return null;
    }

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${env.SLACK_BOT_TOKEN}` },
    }).catch(() => null);

    if (!response) {
      logger.warn(
        { fileId: file.id, name: file.name },
        'Failed to download attachment'
      );
      return null;
    }

    if (!response.ok) {
      logger.warn(
        { fileId: file.id, name: file.name, status: response.status },
        'Failed to download attachment'
      );
      return null;
    }

    const contentLengthHeader = response.headers.get('content-length');
    const contentLength = contentLengthHeader
      ? Number(contentLengthHeader)
      : null;
    if (contentLength && contentLength > MAX_ATTACHMENT_BYTES) {
      logger.warn(
        { fileId: file.id, name: file.name, size: contentLength },
        'Attachment exceeds size limit'
      );
      return null;
    }

    const content = Buffer.from(await response.arrayBuffer());
    if (content.byteLength > MAX_ATTACHMENT_BYTES) {
      logger.warn(
        { fileId: file.id, name: file.name, size: content.byteLength },
        'Attachment exceeds size limit'
      );
      return null;
    }

    return content;
  }
}

function sanitizeFileName(file: SlackFile): string {
  const baseName = path.posix.basename(file.name ?? 'attachment');
  const safeName = sanitizeFilename(baseName, { replacement: '_' });
  const fallback = file.id ? `file-${file.id}` : 'attachment';

  if (!safeName || safeName === '.' || safeName === '..') {
    return fallback;
  }

  return safeName;
}
