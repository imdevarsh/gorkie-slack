import { Image } from '@daytonaio/sdk';

export function getSandboxImage() {
  return Image.base('node:22-bookworm-slim')
    .runCommands(
      'apt-get update && apt-get install -y git curl ca-certificates && rm -rf /var/lib/apt/lists/*',
      'curl -fsSL https://releases.rivet.dev/sandbox-agent/0.2.x/install.sh | sh',
      'sandbox-agent install-agent opencode'
    )
    .workdir('/home/daytona');
}
