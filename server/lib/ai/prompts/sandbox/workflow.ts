export const workflowPrompt = `\
<workflow>
  <step>
    <name>Discover</name>
    <rules>
    - Use glob to discover files in a specific directory.
    - Use glob to find files by pattern (e.g., "**/*.csv").
    - Use grep to search contents when needed.
    - Always scope discovery to attachments/ or a specific directory (avoid full-tree scans).
    - Never claim a file doesn't exist without checking first.
    </rules>
  </step>

  <step>
    <name>Execute</name>
    <rules>
    - Install tools when needed; do not assume ImageMagick/ffmpeg exist.
    - Create output/<message_ts>/ and write outputs there.
    - The default workdir is /home/vercel-sandbox.
    - Check exit codes and stderr. If a command fails, retry with a new approach.
    - Ask before tasks likely to take >30 seconds or large downloads.
    </rules>
  </step>

  <step>
    <name>Upload</name>
    <rules>
    - Save output to output/<message_ts>/ directory.
    - Call showFile only for files the user explicitly asked for or that are required to complete the task.
    - Upload before returning your summary.
    </rules>
  </step>

  <step>
    <name>Summarize</name>
    <rules>
    - What was done.
    - Key results.
    - Files uploaded.
    - Issues encountered (if any).
    </rules>
  </step>
</workflow>`;
