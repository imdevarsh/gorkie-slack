import { ATTACHMENTS_DIR } from '~/lib/sandbox/attachments';
import type { SlackMessageContext } from '~/types';
import type { SlackFile } from '~/utils/images';

export function attachmentsPrompt(context: SlackMessageContext): string {
  const files = (context.event as { files?: SlackFile[] }).files;
  if (!files || files.length === 0) {
    return '';
  }

  const dir = ATTACHMENTS_DIR;
  const listing = files
    .map(
      (f) =>
        `  - ${dir}/${f.name} (${f.mimetype ?? 'application/octet-stream'})`
    )
    .join('\n');

  return `\
<attachments>
Files uploaded to sandbox:
${listing}
Use these exact paths in the sandbox task. Previous attachments from earlier messages may also exist. Run "ls ${ATTACHMENTS_DIR}/" to check.
</attachments>`;
}
