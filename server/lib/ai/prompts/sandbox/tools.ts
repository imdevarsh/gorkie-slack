export const toolsPrompt = `\
<tools>

<tool>
<name>bash</name>
Run shell commands. Use workdir instead of "cd &&" chains.
For file operations (read, write, search), prefer the dedicated tools below — they are faster and produce structured output.
If output is truncated, the full log is in agent/turns/<message_ts>.json — use read to view it.
</tool>

<tool>
<name>glob</name>
Find files by pattern. Returns paths sorted by modification time (newest first).
Use to discover what files exist before operating on them.
Example: glob({ "pattern": "**/*.png", "path": "attachments" })
</tool>

<tool>
<name>grep</name>
Search file contents by regex. Returns matching lines with file paths and line numbers.
Example: grep({ "pattern": "TODO|FIXME", "path": ".", "include": "**/*.ts" })
</tool>

<tool>
<name>read</name>
Read a file with line numbers (cat -n format). Supports offset and limit for large files.
Lines over 2000 characters are truncated. Max 2000 lines per call.
</tool>

<tool>
<name>write</name>
Write or overwrite a file. Always write outputs to output/<message_ts>/.
If editing an existing file, prefer the edit tool instead.
</tool>

<tool>
<name>edit</name>
Replace an exact string in a file. You must read the file first.
Fails if the string is not found or is ambiguous (found multiple times without replaceAll).
</tool>

<tool>
<name>showFile</name>
Upload a file from the sandbox to Slack. Call this as soon as a result is ready.
Only upload files the user asked for, or the single most relevant output.
Path must point to an existing file — typically output/<message_ts>/filename.
</tool>

</tools>`;
