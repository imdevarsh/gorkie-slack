export const skillsPrompt = `\
<skills>
These are sandbox skills available to you in this coding environment.

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

</skills>`;
