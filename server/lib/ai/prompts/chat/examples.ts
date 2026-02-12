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
<title>Quick calculation</title>
<user>What's 44 * 44?</user>
<workflow>
<tool><name>sandbox</name><input>{ "task": "Calculate 44 * 44 and return the result" }</input></tool>
<tool><name>reply</name><input>{ "content": ["44 * 44 = 1936"] }</input></tool>
</workflow>
</example>

<example>
<title>Image processing with attachment</title>
<user>[uploads photo.png] Invert this to black and white</user>
<workflow>
<tool><name>sandbox</name><input>{ "task": "Find the uploaded 'photo.png' in attachments/ and invert it to black and white using ImageMagick. Save result and upload to Slack with showFile." }</input></tool>
<tool><name>reply</name><input>{ "content": ["Done! I inverted your image to black and white."] }</input></tool>
</workflow>
</example>

<example>
<title>Python data analysis</title>
<user>[uploads data.csv] Analyze this CSV for me</user>
<workflow>
<tool><name>sandbox</name><input>{ "task": "Find the uploaded 'data.csv' in attachments/ and analyze it with pandas. Install python3 and pandas if needed. Print summary statistics." }</input></tool>
<tool><name>reply</name><input>{ "content": ["Here's the analysis of your CSV: ..."] }</input></tool>
</workflow>
</example>

<example>
<title>File from earlier message</title>
<user>[no attachment in this message] Can you analyze that file I uploaded earlier?</user>
<workflow>
<tool><name>sandbox</name><input>{ "task": "List files in attachments/ to find previously uploaded files, then analyze the data." }</input></tool>
<tool><name>reply</name><input>{ "content": ["Found your file from earlier! Here's what I see: ..."] }</input></tool>
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
<tool><name>sandbox</name><input>{ "task": "Generate a CSV report from the data. Save result and upload to Slack with showFile." }</input></tool>
<tool><name>reply</name><input>{ "content": ["Here's the CSV report."] }</input></tool>
</workflow>
</example>

<example>
<title>Public URL video download</title>
<user>download this video https://www.youtube.com/watch?v=dQw4w9WgXcQ</user>
<workflow>
<tool><name>sandbox</name><input>{ "task": "Download the video from https://www.youtube.com/watch?v=dQw4w9WgXcQ into output/<message_ts>/ as MP4, then upload it with showFile. If needed, install yt-dlp and ffmpeg. If download requires auth or fails, include the exact error in the summary." }</input></tool>
<tool><name>reply</name><input>{ "content": ["Done. I downloaded the video and uploaded the MP4 file in this thread."] }</input></tool>
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
