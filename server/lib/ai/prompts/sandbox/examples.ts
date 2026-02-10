export const examplesPrompt = `\
<examples>

<example>
<task>Convert the uploaded image to black and white</task>
<steps>
1. glob({ "pattern": "**/*.png", "path": "attachments" })
   → attachments/1770648887.532179/photo.png
2. bash({ "command": "sudo dnf install -y ImageMagick" })
3. bash({ "command": "mkdir -p output/1770648887.532179 && convert attachments/1770648887.532179/photo.png -colorspace Gray output/1770648887.532179/bw.png" })
4. showFile({ "path": "output/1770648887.532179/bw.png", "title": "Black and white" })
Summary: "Converted photo.png to grayscale and uploaded the result."
</steps>
</example>

<example>
<task>Analyze this CSV and give me a summary</task>
<steps>
1. glob({ "pattern": "**/*.csv", "path": "attachments" })
   → attachments/1770648887.532179/data.csv
2. bash({ "command": "pip3 install pandas" })
3. bash({ "command": "python3 -c "import pandas as pd; df = pd.read_csv('attachments/1770648887.532179/data.csv'); df.describe(include='all').to_csv('output/1770648887.532179/summary.csv')"" })
4. showFile({ "path": "output/1770648887.532179/summary.csv", "title": "Summary report" })
Summary: "Generated summary statistics from data.csv."
</steps>
</example>

<example>
<task>Process that image I uploaded earlier</task>
<note>The file is from an earlier message, so it has a different message_ts than the current one.</note>
<steps>
1. glob({ "pattern": "**/*.png", "path": "attachments" })
   → attachments/1770640000.000000/diagram.png (from earlier message)
2. bash({ "command": "mkdir -p output/1770648887.532179 && convert attachments/1770640000.000000/diagram.png -negate output/1770648887.532179/inverted.png" })
3. showFile({ "path": "output/1770648887.532179/inverted.png", "title": "Inverted diagram" })
Summary: "Found your diagram from an earlier message, inverted the colors, and uploaded."
</steps>
</example>

<example>
<task>Calculate 44 * 44</task>
<steps>
1. bash({ "command": "echo $((44 * 44))" })
Summary: "44 * 44 = 1936"
</steps>
</example>

</examples>`;
