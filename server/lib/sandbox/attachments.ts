import type { Sandbox } from '@e2b/code-interpreter';
import sanitizeFilename from 'sanitize-filename';
import { sandbox as sandboxConfig } from '~/config';
import { env } from '~/env';
import logger from '~/lib/logger';
import type {
  PromptResourceLink,
  SlackFile,
  SlackMessageContext,
} from '~/types';
import { getContextId } from '~/utils/context';

export const ATTACHMENTS_DIR = 'attachments';
const ATTACHMENTS_ABS_DIR = `${sandboxConfig.runtime.workdir}/${ATTACHMENTS_DIR}`;
const MAX_ATTACHMENT_BYTES = sandboxConfig.attachments.maxBytes;

export async function syncAttachments(
  sandbox: Sandbox,
  context: SlackMessageContext,
  files?: SlackFile[]
): Promise<PromptResourceLink[]> {
  if (!files?.length) {
    return [];
  }

  const messageTs = context.event.ts;
  if (!messageTs) {
    return [];
  }

  const ctxId = getContextId(context);

  await sandbox.files.makeDir(ATTACHMENTS_ABS_DIR).catch(() => {});

  const results = await Promise.all(
    files.map((file) => syncFile(sandbox, file, ctxId))
  );

  const uploaded = results.filter(
    (item): item is PromptResourceLink => item !== null
  );

  if (uploaded.length !== files.length) {
    logger.warn({ messageTs, ctxId }, '[sandbox] Attachment sync incomplete');
  }

  logger.info(
    {
      count: uploaded.length,
      messageTs,
      ctxId,
    },
    '[sandbox] Attachments synced'
  );

  return uploaded;
}

async function syncFile(
  sandbox: Sandbox,
  file: SlackFile,
  ctxId: string
): Promise<PromptResourceLink | null> {
  const content = await downloadAttachment(file, ctxId);
  if (!content) {
    return null;
  }

  const name = sanitizeFilename(file.name ?? 'attachment', {
    replacement: '_',
  });
  const safeName = name || `file-${file.id ?? 'unknown'}`;
  const path = `${ATTACHMENTS_ABS_DIR}/${safeName}`;
  const uri = new URL(`file://${path}`).toString();
  const fileData = Uint8Array.from(content).buffer;

  try {
    await sandbox.files.write(path, fileData);
    return {
      type: 'resource_link',
      name: safeName,
      uri,
      ...(file.mimetype ? { mimeType: file.mimetype } : {}),
    };
  } catch (error) {
    logger.warn(
      { error, fileId: file.id, name: file.name, ctxId },
      '[sandbox] Failed to write attachment'
    );
    return null;
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
