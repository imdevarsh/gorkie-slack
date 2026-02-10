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

Persistence rules:
- Snapshots persist across messages in the same thread
- Sandboxes expire after 24 hours
- Installed packages persist per thread

Output directory:
- ALWAYS create output/<current_message_ts>/ and run work there
- Save generated files inside output/<message_ts>/ (never the working directory root)
- Use showFile with output/<message_ts>/ paths to share results with the user
- Example: save chart to output/<message_ts>/chart.png, then showFile({ path: "output/<message_ts>/chart.png" })

Default workdir:
- The bash tool defaults to /home/vercel-sandbox
- If you pass workdir=".", it will be treated as /home/vercel-sandbox
- Relative workdir paths are resolved under /home/vercel-sandbox

Execution logs:
- Commands are logged to agent/turns/<message_ts>.json (stdout/stderr)
- Entries are appended in order of execution
- If output was truncated, read agent/turns/<message_ts>.json
</environment>`;
