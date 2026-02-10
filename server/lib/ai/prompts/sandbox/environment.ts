export const environmentPrompt = `\
<environment>
Runtime: Amazon Linux 2023, Node.js 22 (Vercel Sandbox)
The sandbox is reset between messages. Only output/, agent/ and attachments/ persist across messages in the same thread. Everything else is wiped, including installed packages and temporary files.

Filesystem layout:
\`\`\`
attachments/             # User uploads (auto-managed, read-only, persistent)
  <message_ts>/          # Grouped by message timestamp
    photo.png
    data.csv
output/                  # YOUR generated files go here (persistent)
  result.png
  report.csv
agent/                   # Execution metadata (auto-managed, persistent)
  turns/
    1.json               # { command, stdout, stderr, exitCode }
    2.json
\`\`\`

Persistence rules:
- Only output/ and attachments/ persist across messages
- Installed packages do NOT persist, install as needed
- All other files and folders are wiped between messages

Output directory:
- ALWAYS save generated files to output/ (never the working directory root)
- Use showFile with output/ paths to share results with the user
- Example: save chart to output/chart.png, then showFile({ path: "output/chart.png" })

Execution logs:
- Every command is logged to agent/turns/<n>.json with full stdout/stderr
- If output was truncated, the fullOutput field in the result has the log path
- To recover truncated output: read agent/turns/<n>.json
</environment>`;
