import { ATTACHMENTS_DIR } from '~/lib/ai/tools/execute-code/attachments';
import type { SlackFile } from '~/utils/images';

export function attachmentsPrompt(
  messageTs: string,
  files: SlackFile[] | undefined
): string {
  if (!files || files.length === 0) {
    return '';
  }

  const dir = `${ATTACHMENTS_DIR}/${messageTs}`;
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
Previous attachments from earlier messages may also exist. Run "ls ${ATTACHMENTS_DIR}/" to check.
Clean up with "rm -rf ${ATTACHMENTS_DIR}/" after use.
</attachments>`;
}
