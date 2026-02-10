export const environmentPrompt = `\
<environment>
<filesystem>
All paths are relative to /home/vercel-sandbox (the default working directory).

attachments/<message_ts>/
  User-uploaded files from Slack. Read-only — never write here.
  Files from earlier messages in the thread also live here under their respective message_ts.
  Example: attachments/1770648887.532179/photo.png

output/<message_ts>/
  Your output directory. Write ALL generated files here.
  This is where showFile looks for files to upload.
  Example: output/1770648887.532179/result.png

agent/turns/<message_ts>.json
  Automatic log of each bash command's stdout, stderr, and exit code.
  If bash output was truncated, read this file for the full content.
</filesystem>

<packages>
Do not assume any tool is pre-installed beyond the base OS, Node.js, and Python 3.
Always install before first use:

  System packages: sudo dnf install -y <package>
  Python packages: pip3 install <package>
  Node packages:   npm install -g <package>

Common installs:
  sudo dnf install -y ImageMagick poppler-utils tesseract ffmpeg
  pip3 install pandas matplotlib pillow requests
</packages>
</environment>`;
