import type { Sandbox } from '@daytonaio/sdk';
import sanitizeFilename from 'sanitize-filename';
import { sandbox as sandboxConfig } from '~/config';
import { env } from '~/env';
import logger from '~/lib/logger';
import type { SlackMessageContext } from '~/types';
import { getContextId } from '~/utils/context';
import type { SlackFile } from '~/utils/images';
import { sandboxPath } from './utils';

export const ATTACHMENTS_DIR = 'attachments';
const MAX_ATTACHMENT_BYTES = sandboxConfig.attachments.maxBytes;

export async function syncAttachments(
  sandbox: Sandbox,
  context: SlackMessageContext,
  files?: SlackFile[]
): Promise<void> {
  if (!files?.length) {
    return;
  }

  const messageTs = context.event.ts;
  if (!messageTs) {
    return;
  }

  const ctxId = getContextId(context);
  const dir = sandboxPath(ATTACHMENTS_DIR);

  await sandbox.process.executeCommand(`mkdir -p ${dir}`);

  const results = await Promise.all(
    files.map((file) => syncFile(sandbox, dir, file, ctxId))
  );

  if (results.some((ok) => !ok)) {
    logger.warn({ messageTs, ctxId }, '[sandbox] Attachment sync incomplete');
    return;
  }

  logger.info(
    {
      count: files.length,
      messageTs,
      ctxId,
    },
    '[sandbox] Attachments synced'
  );
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
    await sandbox.fs.uploadFile(content, `${dir}/${safeName}`);
    return true;
  } catch (error) {
    logger.warn(
      { error, fileId: file.id, name: file.name, ctxId },
      '[sandbox] Failed to write attachment'
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
      '[sandbox] Attachment exceeds size limit'
    );
    return null;
  }

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${env.SLACK_BOT_TOKEN}` },
  }).catch(() => null);

  if (!response?.ok) {
    logger.warn(
      { fileId: file.id, name: file.name, status: response?.status, ctxId },
      '[sandbox] Failed to download attachment'
    );
    return null;
  }

  const content = Buffer.from(await response.arrayBuffer());
  if (content.byteLength > MAX_ATTACHMENT_BYTES) {
    logger.warn(
      { fileId: file.id, name: file.name, size: content.byteLength, ctxId },
      '[sandbox] Attachment exceeds size limit'
    );
    return null;
  }

  return content;
}
