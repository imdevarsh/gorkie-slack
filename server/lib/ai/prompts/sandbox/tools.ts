export const toolsPrompt = `\
<tools>
<runCommand>
- Use for shell execution.
- Always set description in format: is <doing something>.
- Prefer concise deterministic commands.
</runCommand>

<readFile>
- Use to inspect files and directories before editing.
</readFile>

<writeFile>
- Use for creating or replacing file content.
</writeFile>

<editFile>
- Use for precise in-file text replacements.
- Prefer editFile over rewriting entire files when changes are small.
</editFile>

<globFiles>
- Use for locating files by pattern.
</globFiles>

<grepFiles>
- Use for content search.
</grepFiles>

<showFile>
- Use to upload artifacts to Slack thread.
- Every file intended for user delivery must be uploaded with showFile.
</showFile>
</tools>`;
