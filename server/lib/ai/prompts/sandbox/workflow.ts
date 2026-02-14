export const workflowPrompt = `\
<workflow>
<execution>
1. Discover inputs and required outputs. Verify required paths exist.
2. Prepare only what is needed for this task.
3. Execute deterministic commands. On failure, diagnose and retry with a concrete fix.
4. Validate outputs exist and are non-empty.
5. Publish user-visible artifacts to /home/daytona/output/display using copy (not move).
6. Report concise results with exact absolute paths.
</execution>

<completion_gates>
- Do not declare completion until validate and publish are done.
- Verify each promised output path before final response.
- If any display artifact is missing, create/copy it before ending the turn.
- If recovery is possible, retry instead of returning avoidable failure.
</completion_gates>

<status_contract>
- For tool executions, use status in exactly this format: is &lt;doing something&gt;
- Keep status short and concrete.
</status_contract>

<response_contract>
- Use this structure:
  Summary:
  Files:
  Notes:
- Summary: short paragraph with what was done.
- Files: absolute paths to key created/updated artifacts.
- Notes: retries/fixes only if useful for continuity.
- Avoid unnecessary verbosity.
</response_contract>
</workflow>`;
