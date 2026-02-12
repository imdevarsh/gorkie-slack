export const examplesPrompt = `\
<examples>

<example>
<description>Fresh task with a new upload, no prior sandbox state.</description>
<task>Convert the uploaded image to black and white</task>
<steps>
1. glob({ "pattern": "**/*.png", "path": "/home/vercel-sandbox/attachments" })
   → /home/vercel-sandbox/attachments/1770648887.532179/photo.png
2. bash({ "command": "sudo dnf install -y ImageMagick" })
3. bash({ "command": "convert /home/vercel-sandbox/attachments/1770648887.532179/photo.png -colorspace Gray /home/vercel-sandbox/output/1770648887.532179/bw.png" })
4. showFile({ "path": "/home/vercel-sandbox/output/1770648887.532179/bw.png", "title": "Black and white" })
Summary: "Converted photo.png to grayscale and uploaded the result."
</steps>
<note>ALWAYS write the output to output/<message_ts>/, never modify files in attachments/.</note>
</example>

<example>
<description>Continuing from an earlier message. The sandbox_files block tells you what already exists, no need to glob for it.</description>
<context>
<sandbox_files>
Files already in the sandbox (newest first):
2026-02-10 14:32:05  output/1770648887.532179/bw.png
2026-02-10 14:31:58  attachments/1770648887.532179/photo.png
</sandbox_files>
<recent_messages>
User: convert my image to black and white
Assistant: Done! Converted photo.png to grayscale.
</recent_messages>
</context>
<task>Now invert it</task>
<steps>
1. bash({ "command": "convert /home/vercel-sandbox/output/1770648887.532179/bw.png -negate /home/vercel-sandbox/output/1770650000.000000/inverted.png" })
2. showFile({ "path": "/home/vercel-sandbox/output/1770650000.000000/inverted.png", "title": "Inverted" })
Summary: "Inverted the black and white image and uploaded."
</steps>
<note>The agent used the file listing to find the previous output directly, no glob needed. Output goes to the current message_ts directory.</note>
</example>

<example>
<description>File from an earlier message, found via sandbox_files context.</description>
<context>
<sandbox_files>
Files already in the sandbox (newest first):
2026-02-10 13:00:12  attachments/1770640000.000000/diagram.png
</sandbox_files>
</context>
<task>Process that image I uploaded earlier</task>
<steps>
1. bash({ "command": "sudo dnf install -y ImageMagick" })
2. bash({ "command": "convert /home/vercel-sandbox/attachments/1770640000.000000/diagram.png -negate /home/vercel-sandbox/output/1770648887.532179/inverted.png" })
3. showFile({ "path": "/home/vercel-sandbox/output/1770648887.532179/inverted.png", "title": "Inverted diagram" })
Summary: "Found your diagram from an earlier message, inverted the colors, and uploaded."
</steps>
<note>Read the file path from sandbox_files instead of globbing. Always write output to the current message_ts directory.</note>
</example>

<example>
<description>Quick calculation</description>
<task>Calculate 44 * 44</task>
<steps>
1. bash({ "command": "echo $((44 * 44))" })
Summary: "44 * 44 = 1936"
</steps>
</example>

</examples>`;
