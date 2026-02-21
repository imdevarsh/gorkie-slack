export const environmentPrompt = `\
<environment>
<filesystem>
Use absolute paths (starting with /home/daytona) in bash commands and showFile inputs to avoid workdir-related mistakes.

attachments/
  User-uploaded files from Slack.
  You may rename the uploaded source file here to a semantic name (for example cat-original.png).
  Do NOT create new generated files here.
  Files from earlier messages in the thread also live here.
  Example: /home/daytona/attachments/photo.png

output/
  Your output directory. Always write ALL generated files here.
  If you DO NOT write your files here, on follow up messages you won't be able to find them, so this is VERY IMPORTANT.
  Upload files from here using showFile.
  Example: /home/daytona/output/result.png
</filesystem>

<packages>
Do not assume any tool is pre-installed beyond the base OS, Node.js, and Python 3.
Always install before first use:

  System packages: sudo apt-get install -y <package>
  Python packages: pip3 install <package>
  Node packages:   npm install -g <package>

Common installs:
  sudo apt-get update && sudo apt-get install -y imagemagick poppler-utils tesseract-ocr ffmpeg
  pip3 install pandas matplotlib pillow requests
</packages>
</environment>`;
