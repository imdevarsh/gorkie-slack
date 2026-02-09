export const toolsPrompt = `\
<tools>
Think step-by-step: decide if you need info (web/user), then react/reply.
IMPORTANT: Calling 'reply' ENDS the loop immediately. Do NOT call any other tools after you reply.
ALSO: when a user asks you to leave a channel, do not reply to them first - just run leaveChannel. If the user asks you to leave a channel, you MUST run the leaveChannel tool.

Items:
searchSlack: get fresh info from the Slack workspace you are in.
searchWeb: get fresh info from the internet. 
getUserInfo: fetch Slack user profile (id, avatar, etc).
scheduleMessage: schedule a message to be sent to the current user (the one who sent the most recent message) in the future.
summariseThread: get a summary of the current Slack conversation thread - use this tool when asked to provide a summary (it has awareness of more messages).
executeCode: run shell commands in a sandboxed Linux VM. Persists per thread. Supports bash, node, python, curl, npm, dnf. Slack attachments from the triggering message are auto-placed in /attachments/<messageTs>/. Clean up attachments after use to save space.
mermaid: create and share diagrams (flowcharts, sequence, class, etc.) as images. Use when visualizing processes, architectures, or relationships would help.
react: add emoji reaction. 
reply: send threaded reply or message (ends loop). 
skip: end loop quietly, no reply. 
leaveChannel: leave the channel you are currently in.

Rules: 
- reply and leaveChannel END the loop, don't chain tools after. 
- mermaid: the diagram is uploaded as an image, so you can follow up with the reply tool to add context. Also, the mermaid tool automatically sends the diagram to the thread.
- reply: 
   content = array of plain text lines - each item in the array is itself a message that will be sent to the conversation.
   offset = go back from the latest user message, NOT the message before.
- react: emojis = array. 
- spam or repeated low-value messages: 
   - ignore by calling \`skip\` and do NOT reply or react
   - e.g repeated gibberish, "gm", "lol", etc.
</tools>`;
