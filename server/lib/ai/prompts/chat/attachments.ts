import { ATTACHMENTS_DIR } from '~/lib/sandbox/attachments';
import type { SlackMessageContext } from '~/types';

export function attachmentsPrompt(context: SlackMessageContext): string {
  const files = context.event.files;
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
