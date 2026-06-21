import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { createLogger } from '@repo/logging';
import dotenv from 'dotenv';
import { defaultBuildLogger, Template } from 'e2b';
import { sandboxConfig } from '../config';

dotenv.config({
  path: resolve(
    fileURLToPath(new URL('../../../../apps/bot/.env', import.meta.url))
  ),
  quiet: true,
});

const logger = await createLogger({ fileLogging: false });

function args() {
  const { values } = parseArgs({
    allowPositionals: false,
    args: process.argv.slice(2),
    options: {
      help: {
        short: 'h',
        type: 'boolean',
      },
      template: {
        short: 't',
        type: 'string',
      },
    },
    strict: true,
  });

  if (values.help) {
    process.stdout.write(
      'Usage: bun run build:template -- [--template <name>]\n'
    );
    process.exit(0);
  }

  return values;
}

async function main(): Promise<void> {
  const apiKey = process.env.E2B_API_KEY;
  if (!apiKey) {
    throw new Error('E2B_API_KEY is required to build the sandbox template.');
  }

  const template = args().template?.trim() || sandboxConfig.template;
  logger.info({ template }, '[sandbox] building e2b template');

  const build = await Template.build(
    Template()
      .fromBaseImage()
      .setEnvs({ HOME: '/home/user' })
      .setUser('root')
      .runCmd('apt-get update')
      .aptInstall(
        [
          'curl',
          'ca-certificates',
          'fd-find',
          'ripgrep',
          'imagemagick',
          'ffmpeg',
          'python3-pip',
          'python3-pil',
          'expect',
          'zip',
          'unzip',
          'jq',
          'sudo',
        ],
        { noInstallRecommends: true }
      )
      .runCmd([
        'if command -v fdfind >/dev/null 2>&1; then ln -sf "$(command -v fdfind)" /usr/local/bin/fd; fi',
        'apt-get purge -y nodejs nodejs-doc || true',
        'apt-get autoremove -y || true',
        'curl -fsSL https://deb.nodesource.com/setup_24.x | bash -',
        'apt-get install -y nodejs',
        'ln -sf /usr/bin/node /usr/local/bin/node && ln -sf /usr/bin/npm /usr/local/bin/npm && ln -sf /usr/bin/npx /usr/local/bin/npx',
        'node --version | grep -E "^v2[4-9]" || (echo "ERROR: Node 24+ required, got $(node --version)" && exit 1)',
        'npm config --global set prefix /usr/local',
        'python3 -m pip install --no-cache-dir --break-system-packages --no-user --upgrade pip',
        'python3 -m pip install --no-cache-dir --break-system-packages --no-user pillow matplotlib numpy pandas requests agentmail',
        'npm install -g agent-browser',
        'bash -lc "yes | agent-browser install --with-deps"',
        'chown -R user:user /home/user',
      ])
      .setUser('user')
      .setWorkdir('/home/user'),
    template,
    {
      apiKey,
      onBuildLogs: defaultBuildLogger(),
    }
  );

  logger.info(
    {
      buildId: build.buildId,
      name: build.name,
      templateId: build.templateId,
    },
    '[sandbox] built e2b template'
  );
}

main().catch((error: unknown) => {
  logger.error({ err: error }, '[sandbox] failed to build e2b template');
  process.exit(1);
});
