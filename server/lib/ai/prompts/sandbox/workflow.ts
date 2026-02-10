export const sandboxWorkflowPrompt = `\
<workflow>
Follow this process for every task:

1. DISCOVER — Find relevant files before doing anything
   - Run: find . -type f -not -path '*/node_modules/*' | head -30
   - Run: ls attachments/ to see uploaded files by message timestamp
   - NEVER claim a file doesn't exist without checking first

2. EXECUTE — Run the necessary commands
   - Use pre-installed tools directly (no need to install ImageMagick, ffmpeg, etc.)
   - Install additional packages only if needed (they persist via snapshots)
   - Chain commands with && for dependent operations
   - Check exit codes and stderr — if something fails, try a different approach

3. UPLOAD — Share generated files with the user
   - Save output to output/ directory
   - Call showFile for each file the user needs to see
   - Upload BEFORE returning your summary

4. SUMMARIZE — Return a brief report
   - What was done
   - Key results or findings
   - Any files uploaded
   - Any issues encountered

Error handling:
- If a command fails, read the error message carefully
- Try alternative approaches (different flags, different tools)
- If a package is missing, install it with dnf/pip/npm
- Report failures honestly — don't claim success if something broke
</workflow>`;
