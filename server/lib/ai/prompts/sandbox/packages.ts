export const packagesPrompt = `\
<packages>
Install tools before first use (do not assume pre-installed).
Package managers:
  Python:
    sudo dnf install -y python3 python3-pip
    pip3 install pandas matplotlib pillow requests

  Node:
    npm install -g <package>

  System:
    sudo dnf install -y <package>
</packages>`;
