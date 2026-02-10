export const sandboxToolsPrompt = `\
<tools>

<tool>
<name>executeCode</name>
<description>
Run a shell command (via sh -c). Supports bash, pipes, redirection, and all shell features.
Commands have a 10-minute timeout. Exit code, stdout, and stderr are all returned.
</description>
<rules>
- Commands run via sh -c — pipes, redirection, subshells, and all shell features work
- 10-minute timeout per command
- Always save generated files to output/, never to the working directory root
- If output is truncated, the full log is in agent/turns/<n>.json
</rules>
<examples>
- Simple: executeCode({ "command": "echo $((44 * 44))" })
- Pipeline: executeCode({ "command": "cat data.csv | head -5 | column -t -s','" })
- Multi-step: executeCode({ "command": "cd output && convert ../attachments/*/photo.png -negate result.png && ls -lh result.png" })
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

<tool>
<name>readFile</name>
<description>
Read file contents from the sandbox filesystem with optional pagination.
Use for inspecting file contents without running cat. Supports offset and limit for large files.
</description>
<rules>
- Default: 200 lines from the start
- Use offset to skip lines, limit to cap output (max 500 lines)
- Returns totalLines so you know the full file size
</rules>
<examples>
- readFile({ "path": "output/data.json" })
- readFile({ "path": "output/log.txt", "offset": 100, "limit": 50 })
</examples>
</tool>

</tools>`;
