export const toolsPrompt = `\
<tools>

<tool>
<name>bash</name>
<description>
Executes a given bash command in a sandboxed Linux VM.
</description>
<rules>
- All commands run in /home/vercel-sandbox by default. Use workdir to run in a different directory. Avoid "cd &&" chains.
- This tool is for terminal operations like git, npm, docker, etc. Do not use it for file operations (reading, writing, editing, searching, finding files) - use the specialized tools instead.
- Before executing a command, verify the parent directory exists if creating new files or folders.
- Always quote file paths that contain spaces with double quotes.
- If output is truncated, the full log is in agent/turns/<n>.json.
- Avoid using bash with find/grep/cat/head/tail/sed/awk/echo unless explicitly required.
- Do not assume packages or files outside output/ and attachments/ will be available across messages.
</rules>
<examples>
- Simple: bash({ "command": "echo $((44 * 44))" })
- Pipeline: bash({ "command": "cat data.csv | head -5 | column -t -s','" })
- With workdir: bash({ "command": "convert ../attachments/*/photo.png -negate result.png && ls -lh result.png", "workdir": "output" })
</examples>
</tool>

<tool>
<name>glob</name>
<description>
- Fast file pattern matching tool that works with any codebase size.
- Supports glob patterns like "**/*.js" or "src/**/*.ts".
- Returns matching file paths sorted by modification time.
</description>
<rules>
- Use this tool when you need to find files by name patterns.
- When you are doing an open-ended search that may require multiple rounds of globbing and grepping, narrow your pattern.
</rules>
<examples>
- glob({ "pattern": "**/*.csv", "path": "attachments" })
- glob({ "pattern": "*.{ts,tsx}", "path": "src" })
</examples>
</tool>

<tool>
<name>grep</name>
<description>
- Fast content search tool that works with any codebase size.
- Searches file contents using regular expressions.
- Supports full regex syntax (e.g., "log.*Error", "function\\s+\\w+").
- Filter files by pattern with include.
</description>
<rules>
- Use this tool when you need to find files containing specific patterns.
- If you need to count matches, consider bash with rg directly.
- When you are doing an open-ended search that may require multiple rounds of globbing and grepping, narrow your scope.
</rules>
<examples>
- grep({ "pattern": "TODO|FIXME", "path": ".", "include": "**/*.ts" })
- grep({ "pattern": "SLACK_", "path": "server", "include": "**/*.ts" })
</examples>
</tool>

<tool>
<name>read</name>
<description>
Reads a file from the local filesystem. You can access any file directly by using this tool.
</description>
<rules>
- Assume this tool is able to read all files on the machine. If the user provides a path, assume it is valid.
- By default, it reads up to 2000 lines starting from the beginning of the file.
- You can optionally specify a line offset and limit.
- Any lines longer than 2000 characters will be truncated.
- Results are returned using cat -n format, with line numbers starting at 1.
- If you read a file that exists but has empty contents you will receive a system reminder warning in place of file contents.
- You can read image files using this tool.
</rules>
<examples>
- read({ "path": "output/data.json" })
- read({ "path": "output/log.txt", "offset": 100, "limit": 50 })
</examples>
</tool>

<tool>
<name>write</name>
<description>
Writes a file to the local filesystem.
</description>
<rules>
- This tool will overwrite the existing file if there is one at the provided path.
- If this is an existing file, you MUST use the Read tool first to read the file's contents.
- ALWAYS prefer editing existing files. NEVER write new files unless explicitly required.
- NEVER proactively create documentation files (*.md) or README files. Only create documentation files if explicitly requested by the user.
- Only use emojis if the user explicitly requests it. Avoid writing emojis to files unless asked.
</rules>
<examples>
- write({ "path": "output/report.csv", "content": "a,b\\n1,2\\n" })
- write({ "path": "notes.txt", "content": "Draft ideas..." })
</examples>
</tool>

<tool>
<name>edit</name>
<description>
Performs exact string replacements in files.
</description>
<rules>
- You must use your Read tool at least once in the conversation before editing.
- Preserve the exact indentation from Read output (line numbers are not part of the content).
- The edit will fail if oldString is not found.
- The edit will fail if oldString is found multiple times unless replaceAll is true.
- Use replaceAll for replacing and renaming strings across the file.
</rules>
<examples>
- edit({ "path": "output/config.json", "oldString": ""enabled": false", "newString": ""enabled": true" })
- edit({ "path": "output/log.txt", "oldString": "ERROR", "newString": "WARN", "replaceAll": true })
</examples>
</tool>

<tool>
<name>showFile</name>
<description>
Upload a file from the sandbox to Slack so the user can see or download it.
The file must exist in the sandbox filesystem. Generated files live in output/, user uploads in attachments/<message_ts>/.
</description>
<rules>
- Call showFile as soon as the file is ready — don't wait until the end
- Use relative paths: output/result.png, attachments/1770648887.532179/photo.png
</rules>
<examples>
- showFile({ "path": "output/result.png", "title": "Processed image" })
- showFile({ "path": "output/report.csv", "filename": "analysis-report.csv" })
</examples>
</tool>
</tools>`;
