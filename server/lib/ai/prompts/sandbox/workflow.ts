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
    - Use pre-installed tools directly (no need to install ImageMagick, ffmpeg, etc.).
    - Install additional packages only if needed (they persist via snapshots).
    - Create output/<message_ts>/ and set workdir to that path.
    - Chain commands with && for dependent operations.
    - Check exit codes and stderr, if something fails, try a different approach.
    - Avoid time-consuming work; ask before tasks likely to take >30 seconds or large downloads.
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
    - Key results or findings.
    - Any files uploaded.
    - Any issues encountered.
    </rules>
  </step>

  <step>
    <name>Error Handling</name>
    <rules>
    - If a command fails, read the error message carefully.
    - Try alternative approaches (different flags, different tools).
    - If a package is missing, install it with dnf/pip/npm.
    - Report failures honestly, don't claim success if something broke.
    </rules>
  </step>
</workflow>`;
