export const environmentPrompt = `\
<environment>
Paths:
- Attachments: /home/daytona/attachments
- Working output: /home/daytona/output
- Slack-visible output: /home/daytona/output/display

File rules:
- Always create generated files under /home/daytona/output
- Copy user-visible files into /home/daytona/output/display
- Use cp (not mv) when preparing display artifacts
- Keep original files in place for future turns
- Use absolute paths in commands for reliability
</environment>`;
