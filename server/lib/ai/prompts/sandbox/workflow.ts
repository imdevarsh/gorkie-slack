export const workflowPrompt = `\
<workflow>
Follow these steps for every task:

1. Discover: Find the relevant files before doing anything.
  Use glob to locate uploads in attachments/ or outputs from earlier messages.
  Never claim a file does not exist without checking first.
  For edit iterations, pick the latest relevant output as base input, not the oldest original, unless user says to restart.
  If user requested an uploaded asset, bind that exact file path before running transforms.

2. Install: Install any tools you need before first use.
  The base image is minimal. If you need ImageMagick, pandas, ffmpeg, etc., install them.
  Use deterministic fallback for any missing system tool.

3. Execute: Run commands and ALWAYS write outputs to output/.
  Check exit codes and stderr after every command. If something fails, diagnose and retry.
  Prefer renaming input once in attachments/<name>-original.<ext> before processing.
  Immediately rename generic filenames to semantic names aligned with user intent.
  The final render command MUST include every required input path discovered in step 1.
  EVERY tool call MUST include a required status field using "is <verb> ..." phrasing.
  Tip: Keep status under 40 chars, otherwise Slack rejects it.

4. Upload: Call showFile for the finished result.
  Do this immediately when the file is ready, not at the very end.
  showFile also requires status and should describe the upload step.

5. Summarize: Return a compact structured summary with these exact sections:
  Summary:
  Files:
  Notes:
</workflow>`;
