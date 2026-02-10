export const examplesPrompt = `\
<examples>

<example>
<title>Image processing</title>
<task>Convert the uploaded photo to black and white</task>
<workflow>
<tool><name>glob</name><input>{ "pattern": "**/*.png", "path": "attachments", "status": "is locating the photo" }</input></tool>
<tool><name>bash</name><input>{ "command": "convert attachments/1770648887.532179/photo.png -colorspace Gray output/bw.png", "status": "is converting the image" }</input></tool>
<tool><name>showFile</name><input>{ "path": "output/bw.png", "title": "Black and white" }</input></tool>
Summary: "Converted photo.png to grayscale and uploaded the result."
</workflow>
</example>

<example>
<title>CSV analysis with Python</title>
<task>Analyze this CSV and show summary statistics</task>
<workflow>
<tool><name>glob</name><input>{ "pattern": "**/*.csv", "path": "attachments", "status": "is locating the CSV" }</input></tool>
<tool><name>bash</name><input>{ "command": "sudo dnf install -y python3 python3-pip && pip3 install pandas", "status": "is installing dependencies" }</input></tool>
<tool><name>bash</name><input>{ "command": "python3 -c \"import pandas as pd; df = pd.read_csv('attachments/.../data.csv'); print(df.describe())\"", "status": "is analyzing the CSV" }</input></tool>
Summary: "The CSV has 1000 rows and 5 columns. Here are the stats: ..."
</workflow>
</example>

<example>
<title>PDF text extraction</title>
<task>Extract text from this PDF</task>
<workflow>
<tool><name>glob</name><input>{ "pattern": "**/*.pdf", "path": "attachments", "status": "is locating the PDF" }</input></tool>
<tool><name>bash</name><input>{ "command": "pdftotext attachments/.../document.pdf output/extracted.txt", "status": "is extracting text" }</input></tool>
<tool><name>read</name><input>{ "path": "output/extracted.txt" }</input></tool>
<tool><name>showFile</name><input>{ "path": "output/extracted.txt", "title": "Extracted text" }</input></tool>
Summary: "Extracted 5 pages of text from document.pdf."
</workflow>
</example>

<example>
<title>File from earlier message</title>
<task>Process that image I uploaded earlier</task>
<workflow>
<tool><name>glob</name><input>{ "pattern": "**/*.png", "path": "attachments", "status": "is locating previous uploads" }</input></tool>
<tool><name>bash</name><input>{ "command": "convert attachments/1770648793.474479/diagram.png -negate output/diagram.png", "status": "is processing the image" }</input></tool>
<tool><name>showFile</name><input>{ "path": "output/diagram.png", "title": "Processed diagram" }</input></tool>
Summary: "Found your diagram from an earlier message and processed it."
</workflow>
Files from all thread messages persist via snapshots. Never claim a file is missing without checking.
</example>

<example>
<title>Generate and export data</title>
<task>Generate a report as CSV</task>
<workflow>
<tool><name>bash</name><input>{ "command": "python3 script.py > output/report.csv", "workdir": "/home/vercel-sandbox", "status": "is generating the report" }</input></tool>
<tool><name>showFile</name><input>{ "path": "output/report.csv", "title": "Report" }</input></tool>
Summary: "Generated a CSV report with 500 rows."
</workflow>
</example>

<example>
<title>Quick calculation</title>
<task>Calculate 44 * 44</task>
<workflow>
<tool><name>bash</name><input>{ "command": "echo $((44 * 44))", "status": "is calculating" }</input></tool>
Summary: "44 * 44 = 1936"
</workflow>
</example>

</examples>`;
