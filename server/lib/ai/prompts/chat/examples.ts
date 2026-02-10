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
<title>Time-sensitive lookup</title>
<user>What's the latest version of Node.js?</user>
<workflow>
<tool><name>searchWeb</name><input>{ "query": "latest Node.js version" }</input></tool>
<tool><name>reply</name><input>{ "content": ["The latest Node.js release is ... (source: web search)."] }</input></tool>
</workflow>
</example>

<example>
<title>Quick calculation</title>
<user>What's 44 * 44?</user>
<workflow>
<tool><name>reply</name><input>{ "content": ["44 * 44 = 1936"] }</input></tool>
</workflow>
</example>

<example>
<title>Image processing with attachment</title>
<user>[uploads photo.png] Invert this to black and white</user>
<workflow>
<tool><name>sandboxAgent</name><input>{ "task": "Invert the uploaded photo to black and white and upload the result to Slack.", "context": "The file is in attachments/<message_ts>/photo.png" }</input></tool>
<tool><name>reply</name><input>{ "content": ["Done! I inverted your image to black and white."] }</input></tool>
</workflow>
</example>

<example>
<title>Python data analysis</title>
<user>[uploads data.csv] Analyze this CSV for me</user>
<workflow>
<tool><name>sandboxAgent</name><input>{ "task": "Analyze the uploaded CSV and summarize key stats.", "context": "The file is in attachments/<message_ts>/data.csv" }</input></tool>
<tool><name>reply</name><input>{ "content": ["Here's the analysis of your CSV: ..."] }</input></tool>
</workflow>
</example>

<example>
<title>File from earlier message</title>
<user>[no attachment in this message] Can you analyze that file I uploaded earlier?</user>
<workflow>
<tool><name>sandboxAgent</name><input>{ "task": "Find the file uploaded earlier in this thread and analyze it.", "context": "Search attachments/ for the most recent data file" }</input></tool>
<tool><name>reply</name><input>{ "content": ["Found your file from earlier! Here's what I see: ..."] }</input></tool>
</workflow>
Never claim a file is missing without checking attachments/ first. Files from all thread messages persist via snapshots.
</example>

<example>
<title>Find attachment by name</title>
<user>Use the PDF I attached earlier</user>
<workflow>
<tool><name>sandboxAgent</name><input>{ "task": "Find the PDF in attachments and extract its text.", "context": "Search attachments/ for *.pdf" }</input></tool>
<tool><name>reply</name><input>{ "content": ["Processed the PDF and extracted text."] }</input></tool>
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
<tool><name>sandboxAgent</name><input>{ "task": "Generate a CSV report from the data and upload it.", "context": "Write report.csv in the sandbox" }</input></tool>
<tool><name>reply</name><input>{ "content": ["Here's the CSV report."] }</input></tool>
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
