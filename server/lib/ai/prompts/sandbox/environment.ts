export const environmentPrompt = `\
<environment>
<filesystem>
Use absolute paths (starting with /home/vercel-sandbox) in bash commands and showFile inputs to avoid workdir-related mistakes.
Relative paths are allowed, but absolute paths are preferred for reliability.

attachments/<message_ts>/
  User-uploaded files from Slack. Read-only, NEVER ever write here.
  Files from earlier messages in the thread also live here under their respective message_ts.
  Example: attachments/1770648887.532179/photo.png

output/<message_ts>/
  Your output directory. Always write ALL generated files here.
  If you DO NOT write your files here, on follow up messages you won't be able to find them, so this is VERY IMPORTANT.
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

On Amazon Linux 2023, many packages are not available in default repos.
Use this install pattern for system tools:
  - Try one package-manager install attempt.
  - If dnf returns "No match" / "Unable to find a match", stop retrying dnf for that tool.
  - Fall back to a pinned standalone binary/archive in output/<message_ts>/<tool>/ and run it via absolute path.
  - If extracting .tar.xz archives, ensure xz is installed first: sudo dnf install -y xz
  - After installing ALWAYS delete the archive, and other folders with artifacts to save storage...

Common installs:
  sudo dnf install -y ImageMagick poppler-utils tesseract
  pip3 install pandas matplotlib pillow requests
</packages>
</environment>`;
