import type { Experimental_SandboxSession } from '@ai-sdk/provider-utils';
import sanitizeFilename from 'sanitize-filename';
import { sandbox as sandboxConfig } from '@/config';
import { env } from '@/env';
import logger from '@/lib/logger';
import type {
  PromptResourceLink,
  SlackFile,
  SlackMessageContext,
} from '@/types';
import { getContextId } from '@/utils/context';

const ATTACHMENTS_DIR = 'attachments';
const MAX_ATTACHMENT_BYTES = sandboxConfig.attachments.maxBytes;

export async function syncAttachments(
  sandbox: Experimental_SandboxSession,
  context: SlackMessageContext,
  sessionWorkDir: string,
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
  const attachmentsDir = `${sessionWorkDir}/${ATTACHMENTS_DIR}`;

  await Promise.resolve(
    sandbox.run({ command: `mkdir -p ${JSON.stringify(attachmentsDir)}` })
  ).catch(() => undefined);

  const results = await Promise.all(
    files.map((file) => syncFile({ attachmentsDir, ctxId, file, sandbox }))
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

async function syncFile({
  attachmentsDir,
  ctxId,
  file,
  sandbox,
}: {
  attachmentsDir: string;
  ctxId: string;
  file: SlackFile;
  sandbox: Experimental_SandboxSession;
}): Promise<PromptResourceLink | null> {
  const content = await downloadAttachment(file, ctxId);
  if (!content) {
    return null;
  }

  const name = sanitizeFilename(file.name ?? 'attachment', {
    replacement: '_',
  });
  const safeName = name || `file-${file.id ?? 'unknown'}`;
  const path = `${attachmentsDir}/${safeName}`;
  const uri = new URL(`file://${path}`).toString();
  const fileData = Uint8Array.from(content).buffer;

  try {
    await sandbox.writeBinaryFile({ path, content: new Uint8Array(fileData) });
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
