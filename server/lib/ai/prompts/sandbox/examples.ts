export const examplesPrompt = `\
<examples>

<example>
<title>Image processing</title>
<task>Convert the uploaded image to black and white</task>
<workflow>
<tool><name>glob</name><input>{ "pattern": "**/*.png", "path": "attachments", "status": "is locating the image" }</input></tool>
<tool><name>bash</name><input>{ "command": "sudo dnf install -y ImageMagick", "status": "is installing ImageMagick" }</input></tool>
<tool><name>bash</name><input>{ "command": "mkdir -p output/<id> && convert attachments/<id>/photo.png -colorspace Gray output/<id>/bw.png", "status": "is converting the image" }</input></tool>
<tool><name>showFile</name><input>{ "path": "output/<id>/bw.png", "title": "Black and white" }</input></tool>
Summary: "Converted photo.png to grayscale and uploaded the result."
</workflow>
</example>

<example>
<title>CSV analysis</title>
<task>Analyze this CSV and export a summary report</task>
<workflow>
<tool><name>glob</name><input>{ "pattern": "**/*.csv", "path": "attachments", "status": "is locating the CSV" }</input></tool>
<tool><name>bash</name><input>{ "command": "sudo dnf install -y python3 python3-pip && pip3 install pandas", "status": "is installing dependencies" }</input></tool>
<tool><name>bash</name><input>{ "command": "python3 - <<'PY'\nimport pandas as pd\nimport pathlib\ncsv = next(pathlib.Path('attachments/<id>').glob('*.csv'))\ndf = pd.read_csv(csv)\nsummary = df.describe(include='all')\nsummary.to_csv('output/<id>/summary.csv')\nPY", "status": "is analyzing the CSV" }</input></tool>
<tool><name>showFile</name><input>{ "path": "output/<id>/summary.csv", "title": "Summary report" }</input></tool>
Summary: "Generated summary.csv and uploaded it."
</workflow>
</example>

<example>
<title>PDF text extraction</title>
<task>Extract text from this PDF</task>
<workflow>
<tool><name>glob</name><input>{ "pattern": "**/*.pdf", "path": "attachments", "status": "is locating the PDF" }</input></tool>
<tool><name>bash</name><input>{ "command": "pdftotext attachments/.../document.pdf output/<id>/extracted.txt", "status": "is extracting text" }</input></tool>
<tool><name>read</name><input>{ "path": "output/<id>/extracted.txt" }</input></tool>
<tool><name>showFile</name><input>{ "path": "output/<id>/extracted.txt", "title": "Extracted text" }</input></tool>
Summary: "Extracted 5 pages of text from document.pdf."
</workflow>
</example>

<example>
<title>File from earlier message</title>
<task>Process that image I uploaded earlier</task>
<workflow>
<tool><name>glob</name><input>{ "pattern": "**/*.png", "path": "attachments", "status": "is locating previous uploads" }</input></tool>
<tool><name>bash</name><input>{ "command": "convert attachments/<id>/diagram.png -negate output/<id>/diagram.png", "status": "is processing the image" }</input></tool>
<tool><name>showFile</name><input>{ "path": "output/<id>/diagram.png", "title": "Processed diagram" }</input></tool>
Summary: "Found your diagram from an earlier message and processed it."
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
