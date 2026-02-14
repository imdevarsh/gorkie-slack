export const workflowPrompt = `\
<workflow>
Execution steps:
1. Discover inputs and verify paths exist.
2. Install missing dependencies only if required.
3. Execute task with deterministic commands.
4. Copy final user-visible artifacts to /home/daytona/output/display.
5. Return a short summary with exact output paths.

Status descriptions:
- For tool executions, provide short descriptions in this exact format:
  is <doing something>
- Examples: is finding files, is converting image, is writing final output
</workflow>`;
