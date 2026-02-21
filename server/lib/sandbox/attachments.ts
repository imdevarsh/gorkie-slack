import type { Sandbox } from '@e2b/code-interpreter';
import sanitizeFilename from 'sanitize-filename';
import { sandbox as config } from '~/config';
import { env } from '~/env';
import logger from '~/lib/logger';
import type { SlackMessageContext } from '~/types';
import { getContextId } from '~/utils/context';
import type { SlackFile } from '~/utils/images';

export const ATTACHMENTS_DIR = 'attachments';
const MAX_ATTACHMENT_BYTES = config.attachments.maxBytes;

export interface SyncedAttachment {
  id: string;
  name: string;
  path: string;
  mimeType?: string;
  size: number;
}

export async function syncAttachments(
  sandbox: Sandbox,
  context: SlackMessageContext,
  files?: SlackFile[]
): Promise<SyncedAttachment[]> {
  if (!files?.length) {
    return [];
  }

  const ctxId = getContextId(context);
  await sandbox.files.makeDir(config.paths.attachments);

  const uploaded = await Promise.all(
    files.map(async (file): Promise<SyncedAttachment | null> => {
      const content = await downloadAttachment(file, ctxId);
      if (!content) {
        return null;
      }

      const safeName =
        sanitizeFilename(file.name ?? `attachment-${file.id ?? 'unknown'}`, {
          replacement: '_',
        }) || `attachment-${file.id ?? 'unknown'}`;

      const path = `${config.paths.attachments}/${safeName}`;

      try {
        await sandbox.files.write(path, new Blob([content]));

        return {
          id: file.id ?? safeName,
          name: safeName,
          path,
          mimeType: file.mimetype,
          size: content.byteLength,
        };
      } catch (error) {
        logger.warn(
          {
            error,
            fileId: file.id,
            fileName: file.name,
            path,
            ctxId,
          },
          '[sandbox] Failed to write attachment into sandbox'
        );
        return null;
      }
    })
  );

  const synced = uploaded.filter(
    (item): item is SyncedAttachment => item !== null
  );

  logger.info(
    {
      ctxId,
      syncedCount: synced.length,
      requestedCount: files.length,
    },
    '[sandbox] Attachment sync completed'
  );

  return synced;
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
      {
        ctxId,
        fileId: file.id,
        fileName: file.name,
        size: file.size,
      },
      '[sandbox] Skipping oversized attachment'
    );
    return null;
  }

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${env.SLACK_BOT_TOKEN}`,
    },
  }).catch(() => null);

  if (!response?.ok) {
    logger.warn(
      {
        ctxId,
        fileId: file.id,
        fileName: file.name,
        status: response?.status,
      },
      '[sandbox] Failed to download attachment from Slack'
    );
    return null;
  }

  const data = Buffer.from(await response.arrayBuffer());

  if (data.byteLength > MAX_ATTACHMENT_BYTES) {
    logger.warn(
      {
        ctxId,
        fileId: file.id,
        fileName: file.name,
        size: data.byteLength,
      },
      '[sandbox] Downloaded attachment exceeds limit'
    );
    return null;
  }

  return data;
}
