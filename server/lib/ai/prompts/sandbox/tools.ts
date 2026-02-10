export const toolsPrompt = `\
<tools>

<tool>
<name>bash</name>
<description>
Run a shell command (via sh -c). Supports bash, pipes, redirection, and all shell features.
Commands have a 10-minute timeout. Exit code, stdout, and stderr are all returned.
</description>
<rules>
- Commands run via sh -c: pipes, redirection, subshells, and all shell features work
- 10-minute timeout per command
- Always save generated files to output/, never to the working directory root
- If output is truncated, the full log is in agent/turns/<n>.json
- Prefer ls/glob/grep/read/write/edit for filesystem tasks instead of bash when possible
- Avoid full-tree searches. Scope discovery to attachments/, output/, or a specific directory.
- For content search, prefer the grep tool scoped to a directory.
- Prefer read for inspecting file contents instead of cat/head/tail.
- Quote paths with spaces using double quotes.
- Use && for dependent steps and check stderr/exit codes.
- Default workdir is /home/vercel-sandbox.
- Prefer the workdir parameter instead of "cd &&" chains when using a different directory.
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
Find files by glob pattern within a directory.
</description>
<rules>
- Use when you know the filename pattern (e.g., "*.csv", "**/*.png")
- Provide a path to scope the search
</rules>
<examples>
- glob({ "pattern": "**/*.csv", "path": "attachments" })
- glob({ "pattern": "*.{ts,tsx}", "path": "src" })
</examples>
</tool>

<tool>
<name>grep</name>
<description>
Search file contents using a regex pattern.
</description>
<rules>
- Provide an include pattern when possible to narrow results
- Scope the search to a specific directory
</rules>
<examples>
- grep({ "pattern": "TODO|FIXME", "path": ".", "include": "**/*.ts" })
- grep({ "pattern": "SLACK_", "path": "server", "include": "**/*.ts" })
</examples>
</tool>

<tool>
<name>read</name>
<description>
Read file contents from the sandbox filesystem with optional pagination.
</description>
<rules>
- Default: 200 lines from the start
- Use offset to skip lines, limit to cap output (max 500 lines)
- Returns totalLines so you know the full file size
</rules>
<examples>
- read({ "path": "output/data.json" })
- read({ "path": "output/log.txt", "offset": 100, "limit": 50 })
</examples>
</tool>

<tool>
<name>write</name>
<description>
Write a file to the sandbox filesystem.
</description>
<rules>
- Use for creating or overwriting files
- Prefer writing generated outputs to output/
</rules>
<examples>
- write({ "path": "output/report.csv", "content": "a,b\\n1,2\\n" })
- write({ "path": "notes.txt", "content": "Draft ideas..." })
</examples>
</tool>

<tool>
<name>edit</name>
<description>
Edit a file by exact string replacement.
</description>
<rules>
- Use for small, surgical edits
- If oldString appears multiple times, set replaceAll=true or make oldString more specific
</rules>
<examples>
- edit({ "path": "output/config.json", "oldString": "\"enabled\": false", "newString": "\"enabled\": true" })
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
