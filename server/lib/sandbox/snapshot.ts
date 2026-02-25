import { type Daytona, Image } from '@daytonaio/sdk';
import logger from '~/lib/logger';

export const SANDBOX_SNAPSHOT = 'gorkie-sandbox';

function createImage() {
  return Image.debianSlim('3.12')
    .pipInstall(['requests', 'pillow', 'matplotlib', 'numpy', 'pandas'])
    .runCommands(
      'apt-get update && apt-get install -y git curl ca-certificates imagemagick ffmpeg zip unzip jq ripgrep fd-find sudo && apt-get clean && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*',
      'curl -fsSL https://deb.nodesource.com/setup_24.x | bash -',
      'apt-get install -y nodejs',
      'pip cache purge',
      'npm install -g @mariozechner/pi-coding-agent',
      'npm install -g agent-browser && HOME=/home/daytona bash -lc "yes | agent-browser install --with-deps" && npx --yes skills add vercel-labs/agent-browser --yes',
      'mkdir -p /home/daytona/output /home/daytona/attachments'
    )
    .workdir('/home/daytona');
}

export async function createSnapshot(daytona: Daytona): Promise<void> {
  logger.info({ snapshot: SANDBOX_SNAPSHOT }, '[sandbox] Creating snapshot');
  await daytona.snapshot.create(
    {
      name: SANDBOX_SNAPSHOT,
      image: createImage(),
    },
    {
      onLogs: (chunk) => {
        logger.info(
          {
            snapshot: SANDBOX_SNAPSHOT,
            log: typeof chunk === 'string' ? chunk : JSON.stringify(chunk),
          },
          '[sandbox] Snapshot build log'
        );
      },
    }
  );
  logger.info({ snapshot: SANDBOX_SNAPSHOT }, '[sandbox] Snapshot ready');
}
