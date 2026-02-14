import type { Sandbox } from '@daytonaio/sdk';
import sanitizeFilename from 'sanitize-filename';
import { runtimeConfig } from '~/config';
import { env } from '~/env';
import logger from '~/lib/logger';
import type { SlackMessageContext } from '~/types';
import type { SlackFile } from '~/utils/images';

export const ATTACHMENTS_DIR = runtimeConfig.attachments.directory;

export async function syncRuntimeAttachments(
  sandbox: Sandbox,
  context: SlackMessageContext,
  files?: SlackFile[]
): Promise<void> {
  if (!files?.length) {
    return;
  }

  await sandbox.process.executeCommand(`mkdir -p ${ATTACHMENTS_DIR}`);

  const ctxId = context.event.ts;
  const writes = await Promise.all(
    files.map(async (file) => {
      const content = await downloadAttachment(file);
      if (!content) {
        return false;
      }

      const sanitized = sanitizeFilename(file.name ?? 'attachment', {
        replacement: '_',
      });
      const filename = sanitized || `file-${file.id ?? 'unknown'}`;

      return sandbox.fs
        .uploadFile(content, `${ATTACHMENTS_DIR}/${filename}`)
        .then(() => true)
        .catch((error: unknown) => {
          logger.warn(
            { error, fileId: file.id, filename },
            'Failed to upload attachment to runtime sandbox'
          );
          return false;
        });
    })
  );

  if (writes.some((ok) => !ok)) {
    logger.warn({ ctxId }, 'Some attachments failed to sync to runtime sandbox');
  }
}

async function downloadAttachment(file: SlackFile): Promise<Buffer | null> {
  const url = file.url_private ?? file.url_private_download;
  if (!url) {
    return null;
  }

  if (
    typeof file.size === 'number' &&
    file.size > runtimeConfig.attachments.maxBytes
  ) {
    return null;
  }

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${env.SLACK_BOT_TOKEN}` },
  }).catch(() => null);

  if (!response?.ok) {
    return null;
  }

  const content = Buffer.from(await response.arrayBuffer());
  if (content.byteLength > runtimeConfig.attachments.maxBytes) {
    return null;
  }

  return content;
}
