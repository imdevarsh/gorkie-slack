export const environmentPrompt = `\
<environment>
<paths>
- Working directory: /home/daytona
- Attachments: /home/daytona/attachments
- Output workspace: /home/daytona/output
</paths>

<rules>
- Use absolute paths in shell commands.
- Treat sandbox state as persistent across thread follow-ups.
- Write generated artifacts under /home/daytona/output.
- Upload user-visible artifacts with showFile.
- Use the exact uploaded file path when the user references an upload.
- Verify file existence before claiming a file is missing.
- Avoid writing generated artifacts into /home/daytona/attachments.
- Avoid destructive operations unless explicitly requested.
</rules>

<hygiene>
- Install dependencies only when required.
- Reuse already-installed tools and prior successful outputs when appropriate.
- Keep command sequences minimal and auditable.
- Validate outputs after generation with lightweight sanity checks.
</hygiene>
</environment>`;
