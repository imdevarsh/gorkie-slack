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
<name>executeCode</name>
<description>
Run shell commands in a persistent sandboxed Linux VM (Amazon Linux 2023, Node.js 22).

Persistence:
The sandbox persists for the entire thread via snapshots. ALL files (user uploads, your output files, installed packages) carry over between messages. The sandbox is YOUR workspace, if you created a file in a previous message, it's still there.

Attachments:
- User uploads are placed in: attachments/<message_ts>/
- Attachments from ALL messages in the thread persist, not just the current one

Finding files:
- When a user references a file from earlier in the thread, it's in the sandbox. Don't ask them to re-upload.
- Run: find . -type f -not -path '*/node_modules/*' to discover all files
- Run: ls attachments/ to see uploaded files by message timestamp

Pre-installed:
node (v22), npm, git, curl, tar, gzip, bzip2, unzip, which, openssl

To install packages (use dnf):
  sudo dnf install -y python3 python3-pip    # Python 3 + pip
  sudo dnf install -y ImageMagick            # convert, identify, mogrify
  sudo dnf install -y jq                     # JSON processor
  sudo dnf install -y ffmpeg                 # Video/audio processing
  sudo dnf install -y gcc g++ make           # Build tools

After installing python3-pip:
  pip3 install <package>                     # e.g. pillow, pandas, requests

Node packages:
  npm install -g <package>
</description>
<rules>
- Packages persist via snapshots, install once per thread
- Commands run via sh -c, pipes, redirection, and shell features work
- 10-minute timeout per command
- NEVER say you can't find a file without first running find or ls in the sandbox
</rules>
</tool>

<tool>
<name>showFile</name>
<description>
Upload a file from the sandbox to Slack so the user can see or download it.

Use after generating files with executeCode (images, CSVs, PDFs, charts, etc.). The file must exist in the sandbox filesystem. Use relative paths (e.g. output.png) or full paths (e.g. attachments/1770648887.532179/result.csv).
</description>
<rules>
- Call showFile BEFORE reply so the file appears in the thread.
- Follow up with reply to add context about the file.
</rules>
<examples>
- After image processing: showFile({ "path": "output.png", "title": "Black and white conversion" })
- After CSV generation: showFile({ "path": "report.csv", "filename": "analysis-report.csv" })
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
