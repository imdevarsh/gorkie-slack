export const toolsPrompt = `\
<tools>
Think step-by-step: decide if you need info (web/user), then react/reply.

<tool>
<name>searchSlack</name>
<description>
Search across the entire Slack workspace for messages, files, or discussions.

Use when:
- User asks about past conversations or decisions in other channels
- Looking for files, links, or info shared previously
- Finding who discussed a topic or made a decision
- Researching context from outside the current thread

Search queries work best when specific. Use keywords, user names, channel names, or date ranges.
</description>
</tool>

<tool>
<name>searchWeb</name>
<description>Search the internet for current information, documentation, or answers.</description>
<rules>
- Use for time-sensitive, fast-changing, or uncertain information.
- If the user asks for the latest/current info or to "look up" something, you MUST call this tool before replying.
- Never claim access to private or auth-gated resources; ask the user to provide the content instead.
</rules>
</tool>

<tool>
<name>getUserInfo</name>
<description>Fetch Slack user profile including display name, real name, avatar, status, timezone, and role.</description>
</tool>

<tool>
<name>scheduleMessage</name>
<description>Schedule a message to be delivered to the current user at a future time.</description>
</tool>

<tool>
<name>summariseThread</name>
<description>
Generate a comprehensive summary of the current Slack conversation thread.

This tool has awareness of the ENTIRE thread history (up to 1000 messages), not just the messages in your context window. Use when:
- User explicitly asks for a summary or recap
- Thread is long and you need full context to answer accurately
- You need to understand earlier decisions or action items

Returns a structured summary with key points, decisions, action items, and unresolved questions.
</description>
<examples>
- user: "can you summarize this thread?": summariseThread, then reply with structured summary
- user: "what did we agree on?": summariseThread to get full context, then reply
</examples>
</tool>

<tool>
<name>sandboxAgent</name>
<description>
Delegate a complex, multi-step task to a sandbox subagent that can run code and generate files.
</description>
<rules>
- Provide a clear task statement and any needed context or file hints.
- Use for multi-step data processing, file generation, or analysis that requires several sandbox commands.
</rules>
<examples>
- user: "analyze this CSV and chart it": sandboxAgent with file hints, then reply with the result
- user: "process these images and export a zip": sandboxAgent with steps, then reply with the output
</examples>
</tool>

<tool>
<name>mermaid</name>
<description>Create and share diagrams as images (flowcharts, sequence, class, etc.). Diagram is automatically uploaded to the thread.</description>
<rules>
- Follow up with reply to add context or explanation.
</rules>
</tool>

<tool>
<name>react</name>
<description>Add emoji reaction to a message.</description>
<rules>
- Pass an array of emoji names for multiple reactions.
</rules>
</tool>

<tool>
<name>reply</name>
<description>Send a threaded reply or message.</description>
<rules>
- THIS ENDS THE LOOP. Do NOT call any other tools after reply.
- Content is an array where each item becomes a separate message.
- Offset counts back from the LATEST user message, not the one before.
</rules>
</tool>

<tool>
<name>skip</name>
<description>End the loop quietly with no reply or reaction. Use for spam, repeated gibberish ("gm", "lol"), or low-value messages.</description>
</tool>

<tool>
<name>leaveChannel</name>
<description>Leave the current channel immediately.</description>
<rules>
- Do NOT reply to the user first, just run this tool.
- THIS ENDS THE LOOP. Do NOT call any other tools after leaveChannel.
</rules>
</tool>

</tools>`;
