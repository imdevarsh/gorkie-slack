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
    attachments.files.map((file) => syncFile(sandbox, dir, file, ctxId))
  );

  if (results.some((ok) => !ok)) {
    logger.warn(
      { messageTs: attachments.messageTs, ctxId },
      'Attachment sync incomplete; will retry on next request'
    );
    return;
  }

  logger.info(
    {
      count: attachments.files.length,
      messageTs: attachments.messageTs,
      ctxId,
    },
    'Transported attachments to sandbox'
  );
  syncedAttachments.add(key);
}

async function syncFile(
  sandbox: Sandbox,
  dir: string,
  file: SlackFile,
  ctxId: string
): Promise<boolean> {
  const content = await downloadAttachment(file, ctxId);
  if (!content) {
    return false;
  }

  const name = sanitizeFilename(file.name ?? 'attachment', {
    replacement: '_',
  });
  const safeName = name || `file-${file.id ?? 'unknown'}`;

  try {
    await sandbox.writeFiles([{ path: `${dir}/${safeName}`, content }]);
    return true;
  } catch (error) {
    logger.warn(
      { error, fileId: file.id, name: file.name, ctxId },
      'Failed to write attachment to sandbox'
    );
    return false;
  }
}

async function downloadAttachment(
  file: SlackFile,
  ctxId: string
): Promise<Buffer | null> {
  const url = file.url_private ?? file.url_private_download;
  if (!url) {
    return null;
  }

  if (typeof file.size === 'number' && file.size > MAX_ATTACHMENT_BYTES) {
    logger.warn(
      { fileId: file.id, name: file.name, size: file.size, ctxId },
      'Attachment exceeds size limit'
    );
    return null;
  }

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${env.SLACK_BOT_TOKEN}` },
  }).catch(() => null);

  if (!response?.ok) {
    logger.warn(
      { fileId: file.id, name: file.name, status: response?.status, ctxId },
      'Failed to download attachment'
    );
    return null;
  }

  const content = Buffer.from(await response.arrayBuffer());
  if (content.byteLength > MAX_ATTACHMENT_BYTES) {
    logger.warn(
      { fileId: file.id, name: file.name, size: content.byteLength, ctxId },
      'Attachment exceeds size limit'
    );
    return null;
  }

  return content;
}
