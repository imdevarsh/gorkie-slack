export const examplesPrompt = `\
<examples>

<example>
<description>Fresh task with a new upload, no prior sandbox state.</description>
<task>Convert the uploaded image to black and white</task>
<steps>
1. glob({ "pattern": "**/*.png", "path": "/home/user/attachments", "status": "Finding uploaded png" })
   → /home/user/attachments/photo.png
2. bash({ "command": "sudo apt-get install -y imagemagick", "status": "Installing ImageMagick" })
3. bash({ "command": "mv /home/user/attachments/photo.png /home/user/attachments/cat-original.png && convert /home/user/attachments/cat-original.png -colorspace Gray /home/user/output/cat.png", "status": "Converting to grayscale" })
4. showFile({ "path": "/home/user/output/cat.png", "title": "Black and white", "status": "Uploading result image" })
Summary: "Renamed the source as cat-original.png, generated cat.png, and uploaded the result."
</steps>
<note>ALWAYS write output to output/. Rename files immediately to semantic names (cat, cat-original style).</note>
</example>

<example>
<description>Continuing from an earlier message. The sandbox_files block tells you what already exists, no need to glob for it.</description>
<context>
<recent_messages>
User: convert my image to black and white
Assistant: Done! Renamed your photo to cat-original.png and converted it to grayscale as cat.png.
</recent_messages>
</context>
<task>Now invert it</task>
<steps>
1. bash({ "command": "convert /home/user/output/cat.png -negate /home/user/output/cat-inverted.png", "status": "Inverting image colors" })
2. showFile({ "path": "/home/user/output/cat-inverted.png", "title": "Inverted", "status": "Uploading inverted image" })
Summary: "Inverted the black and white image and uploaded."
</steps>
<note>The agent used the file listing to find the previous output directly, no glob needed. Keep semantic names in output/.</note>
</example>

<example>
<description>File from an earlier message, found via sandbox_files context.</description>
<context>
</context>
<task>Process that image I uploaded earlier</task>
<steps>
1. bash({ "command": "sudo apt-get install -y imagemagick", "status": "Installing ImageMagick" })
2. bash({ "command": "mv /home/user/attachments/diagram.png /home/user/attachments/diagram-original.png && convert /home/user/attachments/diagram-original.png -negate /home/user/output/diagram.png", "status": "Negating diagram colors" })
3. showFile({ "path": "/home/user/output/diagram.png", "title": "Inverted diagram", "status": "Uploading diagram output" })
Summary: "Found your diagram from an earlier message, inverted the colors, and uploaded."
</steps>
<note>Read the file path from sandbox_files instead of globbing. Write outputs to output/ and rename to semantic names.</note>
</example>

<example>
<description>Quick calculation</description>
<task>Calculate 44 * 44</task>
<steps>
1. bash({ "command": "echo $((44 * 44))", "status": "Calculating expression" })
Summary: "44 * 44 = 1936"
</steps>
</example>

</examples>`;
