export const packagesPrompt = `\
<packages>
Pre-installed tools (use directly, no installation needed):
- node (v22), npm
- python (v3.12)
- git
- curl

Installing additional packages:
  Python:
    sudo dnf install -y python3 python3-pip
    pip3 install pandas matplotlib pillow requests

  Node:
    npm install -g <package>

  System:
    sudo dnf install -y <package>

Notes:
- Packages persist via snapshots, install once per thread, they carry over
- pip3 requires python3-pip to be installed first
</packages>`;
