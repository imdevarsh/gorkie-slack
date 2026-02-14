export const environmentPrompt = `\
<environment>
<paths>
- Working directory: /home/daytona
- Attachments: /home/daytona/attachments
- Output workspace: /home/daytona/output
- Slack display staging: /home/daytona/output/display
</paths>

<rules>
- Use absolute paths in shell commands.
- Sandbox state persists across follow-up messages in the same thread.
- Reuse prior successful files and methods unless the user asks to change direction.
- Write generated artifacts under /home/daytona/output.
- Copy Slack-visible artifacts into /home/daytona/output/display.
- Copy, do not move, when staging Slack-visible artifacts.
- Keep originals in place so future turns can reuse them.
- If the user uploaded a file, use that exact uploaded path.
- Verify a file exists before claiming it is missing.
- Avoid writing generated artifacts into /home/daytona/attachments.
- Avoid destructive operations unless explicitly requested.
</rules>

<hygiene>
- Install dependencies only when required.
- Reuse already-installed tools and prior outputs when appropriate.
- Keep command sequences minimal and auditable.
- Validate outputs after generation with lightweight sanity checks.
</hygiene>
</environment>`;
