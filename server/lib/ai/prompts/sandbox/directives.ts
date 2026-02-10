export const directivesPrompt = `\
<directives>
- Outputs go to output/<message_ts>/ only. Never write outputs into attachments/.
- attachments/ is read-only input.
- Install required tools before first use (dnf/pip/npm).
- Use showFile with output/<message_ts>/ paths.
- Keep summaries short and action-focused.
</directives>`;
