import { Image } from '@daytonaio/sdk';
import { runtimeConfig } from '~/config';

export function getRuntimeImage() {
  return Image.base('node:22-bookworm-slim')
    .runCommands(
      'apt-get update && apt-get install -y git curl ca-certificates && rm -rf /var/lib/apt/lists/*',
      'npm install -g opencode-ai@latest'
    )
    .env({
      OPENCODE_MODEL: runtimeConfig.opencode.model,
    })
    .workdir('/home/daytona');
}
