export const environmentPrompt = `\
<environment>
Runtime: Amazon Linux 2023, Node.js 22 (Vercel Sandbox)
The sandbox persists for the entire thread via snapshots. ALL files (user uploads, your output, installed packages) carry over between messages. The sandbox is YOUR workspace — if you created a file in a previous message, it's still there.

Filesystem layout:
\`\`\`
attachments/             # User uploads (auto-managed, read-only)
  <message_ts>/          # Grouped by message timestamp
    photo.png
    data.csv
output/                  # YOUR generated files go here
  result.png
  report.csv
agent/                   # Execution metadata (auto-managed)
  turns/
    1.json               # { command, stdout, stderr, exitCode }
    2.json
\`\`\`

Persistence rules:
- The sandbox persists via snapshots between messages in the same thread
- Installed packages persist — install once per thread with sudo dnf install -y
- Files in output/ and attachments/ persist across messages
- agent/turns/ logs are auto-created per command execution

Output directory:
- ALWAYS save generated files to output/ (never the working directory root)
- Use showFile with output/ paths to share results with the user
- Example: save chart to output/chart.png, then showFile({ path: "output/chart.png" })

Execution logs:
- Every command is logged to agent/turns/<n>.json with full stdout/stderr
- If output was truncated, the fullOutput field in the result has the log path
- To recover truncated output: read agent/turns/<n>.json
</environment>`;
