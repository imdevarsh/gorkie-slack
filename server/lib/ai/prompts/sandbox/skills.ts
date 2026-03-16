export const skillsPrompt = `\
<skills>
These are sandbox skills available to you in this coding environment.
When you want to use a skill, ALWAYS read the full SKILL.md first to understand how to use it.

<skill>
<name>AgentBrowser</name>
<description>
Browser automation skill for public websites. Best for opening pages, reading content, filling forms, clicking buttons, taking screenshots, downloading files, and basic QA flows.
</description>
<use-cases>
- Submit public signup/contact forms and return proof screenshots.
- Scrape structured text from public pages and export results.
- Reproduce UI issues and capture before/after screenshots.
- Download files triggered from buttons/links on public pages.
- Find accurate media assets by searching Google Images or source sites, then download the original file URL.
</use-cases>
<workflow>
- Start with: open URL -> snapshot -i
- Interact with @e refs (click/fill/select/check/press)
- Re-snapshot after navigation or DOM changes
- Use wait (networkidle/url/selector) before final capture
- For assets: search -> open source page -> download -> validate file type/size/dimensions.
</workflow>
</skill>

<skill>
<name>AgentMail</name>
<description>
Email automation skill via AgentMail API/SDK (Node and Python). Supports inbox lifecycle, sending/replying, thread triage, labels, attachments, drafts, and multi-tenant pods.
</description>
<playbook>
- Common goals: inbox triage, sending/replying, label updates, attachment retrieval, and draft-first workflows.
- Core APIs: Inboxes (create/list/get/delete), Messages (send/reply/list/get/update), Threads (list/get), Attachments (get), Drafts (create/send), Pods (tenant isolation).
- Execution: identify target inbox/thread scope, perform requested operations, persist exports in /home/user/output, upload deliverables with showFile, and report inbox/thread/message/draft IDs.
</playbook>
</skill>

<skill>
<name>GitHub CLI (gh)</name>
<description>
GitHub CLI skill. The sandbox has \`GH_TOKEN\` set, \`gh\` is fully authenticated with no extra steps needed.
</description>
<use-cases>
- Clone, push, and pull from any repo the app has access to.
- Create and merge pull requests (\`gh pr create\`, \`gh pr merge\`).
- Open, close, and comment on issues (\`gh issue create\`, \`gh issue comment\`).
- Create and switch branches, then push without credential prompts.
- List repos, view CI run status, download release assets.
- Run \`gh api\` for any GitHub REST or GraphQL endpoint.
</use-cases>
<workflow>
- Read SKILL.md first for available commands and options.
- Use \`gh repo clone <owner>/<repo>\` rather than \`git clone\` with tokens.
- After making changes: \`git add\`, \`git commit\`, \`git push\`, credentials are pre-configured via git.
- Check status with \`gh auth status\` if something seems wrong.
</workflow>
</skill>

<skill>
<name>Hackclub Revoker</name>
<description>
Revoke a HackClub API token via the Revoker API.
</description>
<playbook>
- Endpoint: POST https://revoke.hackclub.com/api/v1/revocations
- JSON body: { "token": "...", "submitter": "gorkie", "comment": "user-reported leak in Slack" }
- Report the result status to the user. Do NOT repeat the full token in your reply.
</playbook>
</skill>

</skills>`;
