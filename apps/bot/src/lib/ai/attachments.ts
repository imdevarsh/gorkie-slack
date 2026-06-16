import nodePath from 'node:path/posix';
import type { SandboxContext } from '@repo/ai';
import type { Message } from 'chat';
import { sanitizeFilename } from '@/lib/utils/sanitize';

export interface SeededAttachment {
  mimeType?: string;
  name: string;
  path: string;
  type: string;
}

export async function seedAttachments({
  message,
  sandboxContext,
}: {
  message: Message;
  sandboxContext: SandboxContext;
}): Promise<SeededAttachment[]> {
  const seeded: SeededAttachment[] = [];
  for (const [index, attachment] of message.attachments.entries()) {
    const data = attachment.fetchData
      ? await attachment.fetchData()
      : attachment.data;
    if (!data) {
      continue;
    }

    const fallback = `attachment-${index + 1}`;
    const filename =
      sanitizeFilename(nodePath.basename(attachment.name || fallback)) ||
      fallback;
    const messageDir = sanitizeFilename(message.id) || 'message';
    const path = nodePath.join(
      sandboxContext.sessionWorkDir,
      'attachments',
      messageDir,
      filename
    );
    const bytes =
      data instanceof Blob
        ? new Uint8Array(await data.arrayBuffer())
        : new Uint8Array(data);
    await sandboxContext.session.writeBinaryFile({ content: bytes, path });
    seeded.push({
      mimeType: attachment.mimeType,
      name: filename,
      path,
      type: attachment.type,
    });
  }
  return seeded;
}

export function promptWithAttachments({
  attachments,
  text,
}: {
  attachments: SeededAttachment[];
  text: string;
}): string {
  if (attachments.length === 0) {
    return text;
  }
  const lines = attachments.map(
    (attachment) =>
      `- ${attachment.name} (${attachment.type}${attachment.mimeType ? `, ${attachment.mimeType}` : ''}): ${attachment.path}`
  );
  return [
    text,
    '',
    'Attached files have already been downloaded into the sandbox workspace:',
    ...lines,
    'Use these local paths when reading, editing, or uploading the files.',
  ].join('\n');
}
