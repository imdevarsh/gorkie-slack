import { type Daytona, Image } from '@daytonaio/sdk';
import logger from '~/lib/logger';

export const SANDBOX_SNAPSHOT = 'gorkie-sandbox';

function createSnapshotImage() {
  return Image.base('node:22-bookworm-slim')
    .runCommands(
      'apt-get update && apt-get install -y git curl ca-certificates && rm -rf /var/lib/apt/lists/*',
      'curl -fsSL https://releases.rivet.dev/sandbox-agent/0.2.x/install.sh | sh',
      'sandbox-agent install-agent opencode',
      'mkdir -p /home/daytona/output/display /home/daytona/attachments'
    )
    .workdir('/home/daytona');
}

export async function createSnapshot(daytona: Daytona): Promise<void> {
  logger.info({ snapshot: SANDBOX_SNAPSHOT }, '[sandbox] Creating snapshot');
  await daytona.snapshot.create(
    {
      name: SANDBOX_SNAPSHOT,
      image: createSnapshotImage(),
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
