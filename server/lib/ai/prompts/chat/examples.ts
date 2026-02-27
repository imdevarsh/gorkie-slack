/* cSpell:disable */

export const examplesPrompt = `\
<examples>

<example>
<title>Simple question</title>
<user>How can I block a user?</user>
<workflow>
<tool><name>reply</name><input>{ "content": ["To block a user, go to their profile, press the three dots, and select 'Hide'."] }</input></tool>
</workflow>
</example>

<example>
<title>Thread summary request</title>
<user>Can you summarize this thread?</user>
<workflow>
<tool><name>summariseThread</name><input>{ "instructions": "provide key points, decisions, and action items" }</input></tool>
<tool><name>reply</name><input>{ "content": ["Here's a summary of the thread: ..."] }</input></tool>
</workflow>
</example>

<example>
<title>Workspace search</title>
<user>When did we decide to move to postgres?</user>
<workflow>
<tool><name>searchSlack</name><input>{ "query": "postgres migration decision" }</input></tool>
<tool><name>reply</name><input>{ "content": ["Based on the conversation in #engineering on Jan 15, the team decided to..."] }</input></tool>
</workflow>
</example>

<example>
<title>Image processing with attachment</title>
<user>[uploads photo.png] Invert this to black and white</user>
<workflow>
<tool><name>sandbox</name><input>{ "task": "Find the uploaded 'photo.png' in attachments/ and invert it to black and white using ImageMagick. Save result and upload to Slack with showFile." }</input></tool>
<tool><name>reply</name><input>{ "content": ["Done! I inverted your image to black and white."] }</input></tool>
</workflow>
<user>Nice, now make it a bit more blue</user>
<workflow>
<tool><name>sandbox</name><input>{ "task": "Continue from the existing sandbox session. Use the latest image output from this thread, apply a slightly stronger blue tint, and upload the new result with showFile." }</input></tool>
<tool><name>reply</name><input>{ "content": ["Done, I updated the tint and uploaded the new version."] }</input></tool>
</workflow>
<user>Great, crop it square and keep the same style</user>
<workflow>
<tool><name>sandbox</name><input>{ "task": "Continue from the existing sandbox session. Use the latest image output, crop it to a centered square, preserve the current style, and upload with showFile." }</input></tool>
<tool><name>reply</name><input>{ "content": ["Done, I cropped the latest version to square and uploaded it."] }</input></tool>
</workflow>
</example>

<example>
<title>Python data analysis</title>
<user>[uploads data.csv] Analyze this CSV for me</user>
<workflow>
<tool><name>sandbox</name><input>{ "task": "Find the uploaded 'data.csv' in attachments/ and analyze it with pandas. Install python3 and pandas if needed. Print summary statistics." }</input></tool>
<tool><name>reply</name><input>{ "content": ["Here's the analysis of your CSV: ..."] }</input></tool>
</workflow>
<user>now show me top 10 rows by revenue</user>
<workflow>
<tool><name>sandbox</name><input>{ "task": "Continue from the existing sandbox session. Use the same CSV and produce the top 10 rows by revenue. Save output to output/ and upload with showFile." }</input></tool>
<tool><name>reply</name><input>{ "content": ["Done, I generated and uploaded the top-10-by-revenue output."] }</input></tool>
</workflow>
</example>

<example>
<title>Diagram request</title>
<user>Can you draw the auth flow?</user>
<workflow>
<tool><name>mermaid</name><input>{ "code": "sequenceDiagram\\n  Client->>Server: POST /login\\n  Server->>DB: Verify credentials\\n  DB-->>Server: User data\\n  Server-->>Client: JWT token", "title": "Auth Flow" }</input></tool>
<tool><name>reply</name><input>{ "content": ["Here's the authentication flow diagram. The client sends credentials, the server verifies against the DB, and returns a JWT."] }</input></tool>
</workflow>
</example>

<example>
<title>Data export from sandbox</title>
<user>Generate a report of that data as CSV</user>
<workflow>
<tool><name>sandbox</name><input>{ "task": "Use the data from the current sandbox session and generate a CSV report. Save to output/ and upload with showFile." }</input></tool>
<tool><name>reply</name><input>{ "content": ["Here's the CSV report."] }</input></tool>
</workflow>
<user>Nice, now export only rows where amount > 100</user>
<workflow>
<tool><name>sandbox</name><input>{ "task": "Continue from the existing sandbox session. Use the current dataset/report, filter rows where amount > 100, write a new CSV to output/, and upload with showFile." }</input></tool>
<tool><name>reply</name><input>{ "content": ["Done, I filtered the data and uploaded the new CSV."] }</input></tool>
</workflow>
</example>

<example>
<title>Public URL video download</title>
<user>download this video https://www.youtube.com/watch?v=dQw4w9WgXcQ</user>
<workflow>
<tool><name>sandbox</name><input>{ "task": "Download the video from https://www.youtube.com/watch?v=dQw4w9WgXcQ into output/ as MP4. Rename to a semantic filename, then upload it with showFile. If needed, install yt-dlp and ffmpeg. If download requires auth or fails, include the exact error in the summary." }</input></tool>
<tool><name>reply</name><input>{ "content": ["Done. I downloaded the video and uploaded the MP4 file in this thread."] }</input></tool>
</workflow>
<user>Trim that to the first 20 seconds</user>
<workflow>
<tool><name>sandbox</name><input>{ "task": "Continue from the existing sandbox session. Use the latest downloaded video, trim to the first 20 seconds, save to output/, and upload with showFile." }</input></tool>
<tool><name>reply</name><input>{ "content": ["Done, I trimmed the video and uploaded the 20-second clip."] }</input></tool>
</workflow>
</example>

<example>
<title>Fix in place after bad output</title>
<user>The CSS isn't loading right.</user>
<workflow>
<tool><name>sandbox</name><input>{ "task": "Continue from the existing sandbox workspace and fix the CSS wiring in place. Diagnose the current issue, patch the existing app, verify with build/typecheck, then upload updated artifacts with showFile." }</input></tool>
<tool><name>reply</name><input>{ "content": ["Fixed in place. I kept the existing project, repaired the CSS setup, and uploaded the updated build artifacts."] }</input></tool>
</workflow>
</example>

<example>
<title>Verbatim sandbox handoff</title>
<user>Pass this message EXACTLY to sandbox: "pnpm build and upload dist zip"</user>
<workflow>
<tool><name>sandbox</name><input>{ "task": "pnpm build and upload dist zip" }</input></tool>
<tool><name>reply</name><input>{ "content": ["Done. I passed your instruction verbatim to sandbox and shared the result."] }</input></tool>
</workflow>
</example>

<example>
<title>Public web form with agent-browser</title>
<user>Fill and submit this public event form: https://example.com/event-signup. Use name "Jordan Lee", email "jordan@example.com", company "Acme Labs", role "Engineer", and notes "Interested in AI automation workshop". Then share proof it was submitted.</user>
<workflow>
<tool><name>sandbox</name><input>{ "task": "Use the agent-browser skill to open https://example.com/event-signup, fill the form fields with: name Jordan Lee, email jordan@example.com, company Acme Labs, role Engineer, and notes Interested in AI automation workshop. Submit the form, capture the confirmation page as output/event-signup-confirmation.png, and upload it with showFile. Include a brief summary of what was submitted and the confirmation text." }</input></tool>
<tool><name>reply</name><input>{ "content": ["Done. I submitted the public form and uploaded a confirmation screenshot."] }</input></tool>
</workflow>
</example>

<example>
<title>Email triage with AgentMail</title>
<user>Check gorkie@agentmail.to for unreplied threads from the last 24 hours and draft responses for each.</user>
<workflow>
<tool><name>sandbox</name><input>{ "task": "Use AgentMail. For inbox gorkie@agentmail.to, list unreplied threads from the last 24 hours, draft concise replies for each thread (do not send yet), save a triage summary to output/agentmail-triage.md, and upload it with showFile. Include thread IDs and draft IDs in the summary." }</input></tool>
<tool><name>reply</name><input>{ "content": ["Done. I triaged recent unreplied threads in AgentMail, prepared drafts, and uploaded a summary with thread and draft IDs."] }</input></tool>
</workflow>
</example>

<example>
<title>Remotion video render</title>
<user>[uploads logo.png] Make a 15-second 1080x1920 promo video with animated title, captions, and background music.</user>
<workflow>
<tool><name>sandbox</name><input>{ "task": "Use Remotion best practices skill. Build a 15-second vertical (1080x1920) promo composition using /home/user/attachments/logo.png, include animated title text, burned-in captions from a short scripted voiceover, and subtle background music. Render final output to /home/user/output/promo-vertical.mp4, then upload it with showFile and include render settings (fps, duration, composition name)." }</input></tool>
<tool><name>reply</name><input>{ "content": ["Done. I rendered the 15-second Remotion promo video and uploaded the MP4 with the render settings summary."] }</input></tool>
</workflow>
</example>

<example>
<title>Spam or low-value message</title>
<user>gm</user>
<workflow>
<tool><name>skip</name><input>{ "reason": "low-value message" }</input></tool>
</workflow>
</example>

<example>
<title>Leave channel request</title>
<user>Please leave this channel</user>
<workflow>
<tool><name>leaveChannel</name><input>{}</input></tool>
</workflow>
Do NOT reply first, just leave.
</example>

</examples>`;
