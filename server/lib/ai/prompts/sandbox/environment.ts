export const environmentPrompt = `\
<environment>
Runtime: Amazon Linux 2023, Node.js 22 (Vercel Sandbox)
The sandbox persists for the thread via snapshots. Files expire after 24 hours.

Filesystem layout:
\`\`\`
attachments/             # User uploads (auto-managed, read-only)
  <message_ts>/          # Grouped by message timestamp
    photo.png
    data.csv
output/                  # Generated files go here
  <message_ts>/          # Create a subfolder per message
    result.png
    report.csv
agent/                   # Execution metadata (auto-managed)
  turns/
    <message_ts>.json    # [{ command, stdout, stderr, exitCode }, ...]
\`\`\`

The latest file/folder in persistance, and execution logs is the latest message in the thread.

Persistence rules:
- Snapshots persist across messages in the same thread
- Sandboxes expire after 24 hours
- Installed packages persist per thread

Output directory:
- Create output/<current_message_ts>/ and write outputs there
- Use showFile with output/<message_ts>/ paths

Default workdir:
- Default is /home/vercel-sandbox
- workdir="." maps to /home/vercel-sandbox
- Relative paths resolve under /home/vercel-sandbox

Execution logs:
- Commands are logged to agent/turns/<message_ts>.json (stdout/stderr)
- If output was truncated, read agent/turns/<message_ts>.json
</environment>`;
