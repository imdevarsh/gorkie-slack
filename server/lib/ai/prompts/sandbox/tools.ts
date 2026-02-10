export const toolsPrompt = `\
<tools>

<tool>
<name>bash</name>
Run shell commands in the sandbox. Commands execute via sh -c in the working directory.
- Use the workdir parameter to run in a specific directory instead of "cd && ..." chains.
- The default workdir is output/<message_ts>/, so generated files land there automatically.
- For file operations (reading, writing, searching), prefer the dedicated tools below, they are faster and return structured output.
- If output is truncated, the full stdout/stderr is saved to agent/turns/<message_ts>.json, use read to view it.
- Pass a status parameter (e.g. "is installing dependencies") to show progress in Slack.
</tool>

<tool>
<name>glob</name>
Find files by glob pattern. Returns paths sorted by modification time (newest first).
Always use this before operating on files, never assume a file exists or guess its path.
- pattern: glob pattern like "**/*.png", "*.csv", "src/**/*.ts"
- path: directory to search in (default: current directory). Use "attachments" to find uploads.
- limit: max results (default 100, max 500). Use a more specific pattern if you hit the limit.
Example: glob({ "pattern": "**/*.png", "path": "attachments" })
</tool>

<tool>
<name>grep</name>
Search file contents using regex. Returns matching lines grouped by file with line numbers.
- pattern: regex pattern (e.g. "TODO|FIXME", "function\\s+\\w+", "error")
- path: directory to search (default: current directory)
- include: glob to filter which files to search (e.g. "**/*.ts", "*.py")
- limit: max matches (default 100, max 500)
Example: grep({ "pattern": "import.*pandas", "path": ".", "include": "**/*.py" })
</tool>

<tool>
<name>read</name>
Read a file and return its contents with line numbers (cat -n format).
- Returns up to 2000 lines by default. Lines over 2000 characters are truncated.
- Use offset and limit for large files: offset is 0-based line number, limit is max lines to return.
- Use this to inspect file contents before editing, or to view truncated bash output from agent/turns/.
Example: read({ "path": "output/1770648887.532179/result.json" })
Example: read({ "path": "agent/turns/1770648887.532179.json", "offset": 0, "limit": 50 })
</tool>

<tool>
<name>write</name>
Create or overwrite a file with the given content.
- Always write generated outputs to output/<message_ts>/.
- If modifying an existing file, prefer the edit tool, it is safer because it only changes the specific string you target.
- Use write for new files or when you need to replace the entire content.
Example: write({ "path": "output/1770648887.532179/report.csv", "content": "name,value\\nfoo,42\\n" })
</tool>

<tool>
<name>edit</name>
Replace an exact string in a file. Safer than write for modifying existing files because it only touches the targeted string.
- You MUST read the file first, edit needs you to know the exact content to replace.
- oldString must match exactly (whitespace, newlines, case all matter).
- Fails if oldString is not found in the file.
- Fails if oldString appears more than once unless you set replaceAll: true.
- Use replaceAll: true to rename a variable or replace all occurrences of a pattern.
Example: edit({ "path": "config.json", "oldString": ""debug": false", "newString": ""debug": true" })
Example: edit({ "path": "app.py", "oldString": "old_name", "newString": "new_name", "replaceAll": true })
</tool>

<tool>
<name>showFile</name>
Upload a file from the sandbox to the Slack thread so the user can see or download it.
- Call this as soon as a result file is ready, do not batch uploads at the end.
- Only upload files the user asked for, or the single most relevant output if the task produces multiple files.
- path: the file to upload, typically output/<message_ts>/filename.ext
- filename: override the display name in Slack (defaults to the file's basename)
- title: description shown in Slack alongside the file
Example: showFile({ "path": "output/1770648887.532179/chart.png", "title": "Revenue chart" })
</tool>

</tools>`;
