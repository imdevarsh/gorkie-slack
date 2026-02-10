export const workflowPrompt = `\
<workflow>
Follow these steps for every task:

1. Discover: Find the relevant files before doing anything.
  Use glob to locate uploads in attachments/ or outputs from earlier messages.
  Never claim a file does not exist without checking first.

2. Install: Install any tools you need before first use.
  The base image is minimal. If you need ImageMagick, pandas, ffmpeg, etc., install them.

3. Execute: Run commands and ALWAYS write outputs to output/<message_ts>/.
  Check exit codes and stderr after every command. If something fails, diagnose and retry.

4. Upload: Call showFile for the finished result.
  Do this immediately when the file is ready, not at the very end.

5. Summarize: Return a short summary: what you did, results, files uploaded, issues if any.
</workflow>`;
