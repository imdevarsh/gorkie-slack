export const sandboxPackagesPrompt = `\
<packages>
Pre-installed tools (use directly, no installation needed):
- node (v22), npm, git, curl, openssl
- ImageMagick (convert, identify, mogrify)
- ffmpeg (video/audio processing)
- ghostscript (PDF rendering)
- poppler-utils (pdftotext, pdftoppm, pdfinfo)
- tesseract (OCR — optical character recognition)
- jq (JSON processing)
- zip, unzip, tar, gzip, bzip2, xz (compression)

Installing additional packages:

  Python:
    sudo dnf install -y python3 python3-pip
    pip3 install pandas matplotlib pillow requests

  Build tools:
    sudo dnf install -y gcc g++ make

  Node packages:
    npm install -g <package>

  System packages:
    sudo dnf install -y <package>

Notes:
- Packages persist via snapshots — install once per thread, they carry over
- Most common tools are pre-installed, use them directly first
- pip3 requires python3-pip to be installed first
</packages>`;
