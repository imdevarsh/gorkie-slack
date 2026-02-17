export const toolsPrompt = `\
<tools>

<tool>
<name>bash</name>
Run shell commands in the sandbox.
- Use cwd instead of chained "cd" where possible.
- Prefer dedicated tools for file read/write/search/list tasks.
- Output is tail-truncated by line/byte limits; continue with narrower commands if needed.
- Pass description in format "is <doing something>" to show progress in Slack.
</tool>

<tool>
<name>listFiles</name>
List directory contents (Pi-style ls).
- path: directory path (relative or absolute, default ".")
- cwd: base directory when path is relative
- limit: max returned entries
- Returns sorted entries with "/" suffix for directories.
Use this first to inspect folders before reading/editing files.
</tool>

<tool>
<name>findFiles</name>
Find files by glob pattern (Pi-style find).
- pattern: required glob (e.g. "**/*.ts", "output/*.png")
- cwd: search directory
- limit: max results
Use this to discover exact file paths before running read/edit/write/showFile.
</tool>

<tool>
<name>grepFiles</name>
Search file contents using ripgrep.
- pattern: required search pattern
- include: optional glob filter (e.g. "**/*.ts")
- ignoreCase: optional case-insensitive matching
- literal: optional fixed-string search mode
- contextLines: optional before/after context lines
- limit: max matches
For very large outputs, narrow include/pattern or increase precision.
</tool>

<tool>
<name>readFile</name>
Read file or directory contents.
- filePath: required relative or absolute path
- cwd: optional base directory for relative paths
- offset: optional line offset (1-indexed) for large files
- limit: optional line window size
Use offset to continue reading large files incrementally.
</tool>

<tool>
<name>writeFile</name>
Create or overwrite a file with full content.
- Creates parent directories automatically.
- Use this for new files or full rewrites.
- Prefer editFile for targeted modifications.
</tool>

<tool>
<name>editFile</name>
Replace exact text inside an existing file.
- oldText must match exactly.
- If replaceAll=false, oldText must be unique in the file.
- Use replaceAll=true only for intentional global replacements.
Read the file first to avoid mismatch errors.
</tool>

<tool>
<name>showFile</name>
Upload a file from sandbox to Slack.
- Upload only primary user-requested deliverables by default.
- Avoid uploading intermediate/debug files unless explicitly requested.
</tool>

</tools>`;
