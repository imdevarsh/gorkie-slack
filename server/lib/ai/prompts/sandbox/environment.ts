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
- You MUST write generated artifacts under /home/daytona/output.
- You MUST copy every Slack-visible artifact into /home/daytona/output/display.
- You MUST copy, NOT move, when preparing Slack-visible artifacts (use cp, never mv).
- You MUST keep originals in place so future turns can reuse them.
- You MUST use clear semantic filenames.
- If a user provided a file, you MUST use that exact uploaded file path; do not fetch substitutes.
- Before claiming a file is missing, you MUST verify it exists in the filesystem.
- You MUST avoid writing generated artifacts into /home/daytona/attachments.
- You MUST avoid destructive operations unless explicitly requested by the user.
- If replacing an output, write a fresh file and keep earlier versions when useful for iteration.

Execution hygiene:
- Install dependencies only when required by the task.
- Reuse already-installed tools and previously generated outputs when suitable.
- Keep command sequences minimal and auditable.
- Validate outputs after generation (existence, basic sanity checks like file type/size when relevant).
</environment>`;
