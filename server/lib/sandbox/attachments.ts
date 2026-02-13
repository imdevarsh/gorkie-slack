import type { Sandbox } from 'modal';
import sanitizeFilename from 'sanitize-filename';
import { sandbox as sandboxConfig } from '~/config';
import { env } from '~/env';
import logger from '~/lib/logger';
import type { SlackMessageContext } from '~/types';
import { getContextId } from '~/utils/context';
import type { SlackFile } from '~/utils/images';
import { writeSandboxFiles } from './modal';
import { attachmentsDir } from './paths';

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
  const dir = attachmentsDir(messageTs);

  const uploads = await Promise.all(
    files.map(
      async (file): Promise<{ path: string; content: Buffer } | null> => {
        const content = await downloadAttachment(file, ctxId);
        if (!content) {
          return null;
        }

        const name = sanitizeFilename(file.name ?? 'attachment', {
          replacement: '_',
        });
        const safeName = name || `file-${file.id ?? 'unknown'}`;
        return { path: `${dir}/${safeName}`, content };
      }
    )
  );

  const writeable = uploads.filter(
    (item): item is { path: string; content: Buffer } => item !== null
  );
  if (writeable.length === 0) {
    return;
  }

  await writeSandboxFiles(sandbox, writeable).catch((error: unknown) => {
    logger.warn(
      { error, ctxId, messageTs },
      '[sandbox] Failed to sync attachments'
    );
  });

  logger.info(
    {
      count: writeable.length,
      messageTs,
      ctxId,
    },
    '[sandbox] Attachments synced'
  );
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
