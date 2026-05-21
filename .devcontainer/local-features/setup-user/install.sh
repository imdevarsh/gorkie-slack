#!/usr/bin/env bash
set -eux

USERNAME=${USERNAME:-"coder"}

if [ "$(id -u)" -ne 0 ]; then
    echo 'Script must be run as root.'
    exit 1
fi

# Ensure the user exists
if ! id "$USERNAME" >/dev/null 2>&1; then
    echo "User '$USERNAME' does not exist. Create it (e.g. via common-utils) before running this script."
    exit 1
fi

USER_HOME=$(getent passwd "$USERNAME" | cut -d: -f6)

# Set up Node path (NVM)
NODE_ROOT="${USER_HOME}/nvm"
if [ -e "$NODE_ROOT" ] && [ ! -L "$NODE_ROOT" ]; then
    rm -rf "$NODE_ROOT"
fi
ln -snf /usr/local/share/nvm "$NODE_ROOT"
NODE_PATH="${NODE_ROOT}/current"
chown -h "${USERNAME}:${USERNAME}" "$NODE_ROOT" || true

# Set up Docker
if getent group docker >/dev/null 2>&1; then
    usermod -aG docker "$USERNAME"
else
    groupadd -r docker
    usermod -aG docker "$USERNAME"
fi

# ---- Python shim ----
PYTHON_ROOT="${USER_HOME}/.python"
PYTHON_PATH="${PYTHON_ROOT}/current"
mkdir -p "$PYTHON_ROOT"
ln -snf /usr/local/python/current "$PYTHON_PATH"
ln -snf /usr/local/python /opt/python
chown "${USERNAME}:${USERNAME}" "$PYTHON_ROOT" || true
chown -h "${USERNAME}:${USERNAME}" "$PYTHON_PATH" || true

# Setup Coder Path
ln -snf /var/tmp/coder/coder-cli/coder /usr/local/bin/coder
ln -snf /var/tmp/coder/code-server/bin/code-server /usr/local/bin/code-server

# Clean secure_path to only include real paths
SUDOERS_FILE="/etc/sudoers.d/${USERNAME}"
TMP_SUDOERS="$(mktemp)"
cat <<EOF > "$TMP_SUDOERS"
Defaults secure_path="${NODE_PATH}/bin:${PYTHON_PATH}/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/home/${USERNAME}/.local/bin"
EOF
install -m 0440 "$TMP_SUDOERS" "$SUDOERS_FILE"
rm -f "$TMP_SUDOERS"

if [ -e "${USER_HOME}/.bashrc" ]; then
    chown "${USERNAME}:${USERNAME}" "${USER_HOME}/.bashrc"
fi
echo "Done!"