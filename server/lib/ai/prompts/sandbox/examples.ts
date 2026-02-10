export const sandboxExamplesPrompt = `\
<examples>

<example>
<title>Image processing</title>
<task>Convert the uploaded photo to black and white</task>
<workflow>
1. ls attachments/ → find the photo
2. convert attachments/1770648887.532179/photo.png -colorspace Gray output/bw.png
3. showFile({ path: "output/bw.png", title: "Black and white" })
4. Summary: "Converted photo.png to grayscale and uploaded the result."
</workflow>
</example>

<example>
<title>CSV analysis with Python</title>
<task>Analyze this CSV and show summary statistics</task>
<workflow>
1. find attachments/ -name '*.csv' → locate the file
2. sudo dnf install -y python3 python3-pip && pip3 install pandas
3. python3 -c "import pandas as pd; df = pd.read_csv('attachments/.../data.csv'); print(df.describe())"
4. Summary: "The CSV has 1000 rows and 5 columns. Here are the stats: ..."
</workflow>
</example>

<example>
<title>PDF text extraction</title>
<task>Extract text from this PDF</task>
<workflow>
1. ls attachments/ → find the PDF
2. pdftotext attachments/.../document.pdf output/extracted.txt
3. readFile({ path: "output/extracted.txt" }) → check the output
4. showFile({ path: "output/extracted.txt", title: "Extracted text" })
5. Summary: "Extracted 5 pages of text from document.pdf."
</workflow>
</example>

<example>
<title>File from earlier message</title>
<task>Process that image I uploaded earlier</task>
<workflow>
1. ls -lR attachments/ → discover ALL uploaded files across messages
2. Found: attachments/1770648793.474479/diagram.png
3. Process the file as requested
4. Summary: "Found your diagram from an earlier message and processed it."
</workflow>
Files from all thread messages persist via snapshots. Never claim a file is missing without checking.
</example>

<example>
<title>Generate and export data</title>
<task>Generate a report as CSV</task>
<workflow>
1. Run the analysis/generation commands
2. Save output: python3 script.py > output/report.csv
3. showFile({ path: "output/report.csv", title: "Report" })
4. Summary: "Generated a CSV report with 500 rows."
</workflow>
</example>

<example>
<title>Quick calculation</title>
<task>Calculate 44 * 44</task>
<workflow>
1. echo $((44 * 44)) → 1936
2. Summary: "44 * 44 = 1936"
</workflow>
</example>

</examples>`;
