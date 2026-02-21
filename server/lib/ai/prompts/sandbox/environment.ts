export const environmentPrompt = `\
<environment>
<filesystem>
Use absolute paths (starting with /home/user) in bash commands and showFile inputs to avoid workdir-related mistakes.
Relative paths are allowed, but absolute paths are preferred for reliability.

attachments/
  User-uploaded files from Slack.
  You may rename the uploaded source file here to a semantic name (for example cat-original.png).
  Do NOT create new generated files here.
  Files from earlier messages in the thread also live here.
  Example: attachments/photo.png

output/
  Your output directory. Always write ALL generated files here.
  If you DO NOT write your files here, on follow up messages you won't be able to find them, so this is VERY IMPORTANT.
  This is where showFile looks for files to upload.
  Example: output/result.png

agent/turns/<message_ts>.json
  Automatic log of each bash command's stdout, stderr, and exit code.
  If bash output was truncated, read this file for the full content.
</filesystem>

<packages>
Do not assume any tool is pre-installed beyond the base OS, Node.js, and Python 3.
Always install before first use:

  System packages: sudo apt-get update && sudo apt-get install -y <package>
  Python packages: pip3 install <package>
  Node packages:   npm install -g <package>

Use this install pattern for system tools:
  - Try apt-get install first.
  - If apt cannot find the package, fall back to a pinned standalone binary/archive in output/<tool>/ and run it via absolute path.
  - If extracting .tar.xz archives, ensure xz is installed first: sudo apt-get install -y xz
  - After installing ALWAYS delete temporary archives and folders to save storage.

Common installs:
  sudo apt-get update && sudo apt-get install -y imagemagick poppler-utils tesseract-ocr
  pip3 install pandas matplotlib pillow requests
</packages>
</environment>`;
