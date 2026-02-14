export const environmentPrompt = `\
<environment>
Environment:
- Working directory: /home/daytona
- Use absolute paths in shell commands for reliability.
- User attachments live at: /home/daytona/attachments
- Primary output workspace: /home/daytona/output
- Slack-visible output staging: /home/daytona/output/display
- The sandbox persists across follow-up messages in the same thread. Reuse prior files and successful methods unless the user asks to change direction.

File rules:
- Always write generated artifacts under /home/daytona/output.
- Any file the user should receive in Slack must be copied into /home/daytona/output/display.
- Copy, do NOT move, when preparing Slack-visible artifacts (use cp, not mv).
- Keep originals in place so future turns can reuse them.
- Use clear semantic filenames.
- If a user provided a file, use that exact uploaded file path; do not fetch substitutes.
- Before claiming a file is missing, verify it exists in the filesystem.
- Avoid writing generated artifacts into /home/daytona/attachments.

Execution hygiene:
- Install dependencies only when required by the task.
- Reuse already-installed tools and previously generated outputs when suitable.
- Keep command sequences minimal and auditable.
</environment>`;
