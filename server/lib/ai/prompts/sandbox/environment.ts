export const environmentPrompt = `\
<environment>
Runtime: Amazon Linux 2023, Node.js 22 (Vercel Sandbox)
The sandbox persists for the entire thread via snapshots. The sandbox is YOUR workspace. But, the sandbox's files expires after 24 hours.

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
- The sandbox persists via snapshots between messages in the same thread
- Sandbox files expire after 24 hours
- Installed packages persist, install once per thread with sudo dnf install -y
- Files in output/ and attachments/ persist across messages
- agent/turns/<message_ts>.json logs are appended per command execution

Output directory:
- ALWAYS create output/<current_message_ts>/ and run work there
- Save generated files inside output/<message_ts>/ (never the working directory root)
- Use showFile with output/<message_ts>/ paths to share results with the user
- Example: save chart to output/<message_ts>/chart.png, then showFile({ path: "output/<message_ts>/chart.png" })

Execution logs:
- Every command is logged to agent/turns/<message_ts>.json with full stdout/stderr
- Entries are appended in order of execution
- If output was truncated, the fullOutput field in the result has the log path
- To recover truncated output: read agent/turns/<message_ts>.json
</environment>`;
