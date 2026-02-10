export const environmentPrompt = `\
<environment>
Sandbox runtime, persistence, and paths.

Runtime: Amazon Linux 2023, Node.js 22 (Vercel Sandbox)
Message ID: <id> (Slack message timestamp)

Persistence:
- Snapshots persist across messages in the same thread
- Sandboxes expire after 24 hours
- Installed packages persist per thread

Paths:
- attachments/<id>/ (read-only uploads)
- output/<id>/ (write outputs here)
- agent/turns/<id>.json (stdout/stderr log)
- Latest output/logs correspond to the most recent message in the thread

Output rules:
- Write outputs to output/<current_id>/
- Never write outputs into attachments/
- Use showFile with output/<id>/ paths

Workdir:
- Default is /home/vercel-sandbox
- workdir="." maps to /home/vercel-sandbox
- Relative paths resolve under /home/vercel-sandbox

Logs:
- Commands are logged to agent/turns/<id>.json
- If output was truncated, read agent/turns/<id>.json
</environment>`;
