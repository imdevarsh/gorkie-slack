export const toolsPrompt = `\
<tools>

<tool>
<name>bash</name>
Run shell commands in the sandbox. Commands execute via sh -c in the working directory.
- Use absolute paths starting with /home/daytona.
- For file operations (reading, writing, searching), prefer the dedicated tools below, they are faster and return structured output.
- Pass a status parameter (e.g. "is installing dependencies") to show progress in Slack.
- Treat meaningful stderr warnings from transformation tools (e.g. ImageMagick font fallback warnings) as a failure to fix before uploading.
</tool>

<tool>
<name>glob</name>
Find files by glob pattern. Returns paths sorted by modification time (newest first).
Always use this before operating on files, never assume a file exists or guess its path.
- pattern: glob pattern like "**/*.png", "*.csv", "src/**/*.ts"
- path: directory to search in (default: current directory). Use "/home/daytona/attachments" to find uploads.
Example: glob({ "pattern": "**/*.png", "path": "/home/daytona/attachments" })
</tool>

<tool>
<name>grep</name>
Search file contents using regex. Returns matching lines grouped by file with line numbers.
- pattern: regex pattern (e.g. "TODO|FIXME", "function\\s+\\w+", "error")
- path: directory to search (default: current directory)
- include: glob to filter which files to search (e.g. "**/*.ts", "*.py")
Example: grep({ "pattern": "import.*pandas", "path": ".", "include": "**/*.py" })
</tool>

<tool>
<name>read</name>
Read a file and return its contents with line numbers.
- Returns up to 2000 lines by default. Lines over 2000 characters are truncated.
- Use offset and limit for large files.
Example: read({ "path": "output/result.json" })
</tool>

<tool>
<name>write</name>
Create or overwrite a file with the given content.
- ALWAYS write generated outputs to output/.
- Immediately rename ambiguous or generic filenames to semantic names.
Example: write({ "path": "output/report.csv", "content": "name,value\\nfoo,42\\n" })
</tool>

<tool>
<name>edit</name>
Replace an exact string in a file. Safer than write for modifying existing files.
- You MUST read the file first, edit needs you to know the exact content to replace.
- oldString must match exactly (whitespace, newlines, case all matter).
Example: edit({ "path": "config.json", "oldString": "\\"debug\\": false", "newString": "\\"debug\\": true" })
</tool>

<tool>
<name>showFile</name>
Upload a file from the sandbox to the Slack thread so the user can see or download it.
- Call this as soon as a result file is ready, do not batch uploads at the end.
- Use this exact command form:
  showFile({ "path": "/home/daytona/output/file.ext", "title": "Result" })
- Only upload files the user asked for, or the single most relevant output.
</tool>

</tools>`;
