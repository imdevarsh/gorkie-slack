export const sandboxWorkflowPrompt = `\
<workflow>
  <step>
    <name>Discover</name>
    <rules>
      <rule>Use glob to discover files in a specific directory.</rule>
      <rule>Use glob to find files by pattern (e.g., "**/*.csv").</rule>
      <rule>Use grep to search contents when needed.</rule>
      <rule>Always scope discovery to attachments/ or a specific directory (avoid full-tree scans).</rule>
      <rule>Never claim a file doesn't exist without checking first.</rule>
    </rules>
  </step>

  <step>
    <name>Execute</name>
    <rules>
      <rule>Use pre-installed tools directly (no need to install ImageMagick, ffmpeg, etc.).</rule>
      <rule>Install additional packages only if needed (they persist via snapshots).</rule>
      <rule>Default workdir is /home/vercel-sandbox.</rule>
      <rule>Prefer bash with workdir instead of "cd &&" chains.</rule>
      <rule>Chain commands with && for dependent operations.</rule>
      <rule>Check exit codes and stderr, if something fails, try a different approach.</rule>
      <rule>Avoid time-consuming work; ask before tasks likely to take &gt;30 seconds or large downloads.</rule>
    </rules>
  </step>

  <step>
    <name>Upload</name>
    <rules>
      <rule>Save output to output/ directory.</rule>
      <rule>Call showFile for each file the user needs to see.</rule>
      <rule>Upload before returning your summary.</rule>
    </rules>
  </step>

  <step>
    <name>Summarize</name>
    <rules>
      <rule>What was done.</rule>
      <rule>Key results or findings.</rule>
      <rule>Any files uploaded.</rule>
      <rule>Any issues encountered.</rule>
    </rules>
  </step>

  <step>
    <name>Error Handling</name>
    <rules>
      <rule>If a command fails, read the error message carefully.</rule>
      <rule>Try alternative approaches (different flags, different tools).</rule>
      <rule>If a package is missing, install it with dnf/pip/npm.</rule>
      <rule>Report failures honestly, don't claim success if something broke.</rule>
    </rules>
  </step>
</workflow>`;
