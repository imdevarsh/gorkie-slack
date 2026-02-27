import { defaultBuildLogger, Template } from 'e2b';
import { parseArgs } from 'node:util';
import { sandbox } from '~/config';
import { env } from '~/env';
import logger from '~/lib/logger';

function args() {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      template: {
        type: 'string',
        short: 't',
      },
      help: {
        type: 'boolean',
        short: 'h',
      },
    },
    strict: true,
    allowPositionals: false,
  });

  if (values.help) {
    process.stdout.write(
      'Usage: bun run server/scripts/build-template.ts [--template <name>]\n'
    );
    process.exit(0);
  }

  return values;
}

async function main(): Promise<void> {
  const template = args()?.template?.trim() || sandbox.template;

  logger.info({ template }, '[sandbox] Building e2b template');

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
        'curl -fsSL https://deb.nodesource.com/setup_24.x | bash -',
        'apt-get install -y nodejs',
        'python3 -m pip install --no-cache-dir --upgrade pip',
        'python3 -m pip install --no-cache-dir pillow matplotlib numpy pandas requests agentmail',
        'npm install -g @mariozechner/pi-coding-agent',
        'npm install -g agent-browser',
        'bash -lc "yes | agent-browser install --with-deps"',
        'npx --yes skills add vercel-labs/agent-browser --yes',
        'npx --yes skills add https://github.com/agentmail-to/agentmail-skills --skill agentmail --yes',
        'npx --yes skills add remotion-dev/skills --yes',
        'mkdir -p /home/user/attachments /home/user/output',
        'chown -R user:user /home/user/attachments /home/user/output',
      ])
      .setUser('user')
      .setWorkdir('/home/user'),
    template,
    {
      apiKey: env.E2B_API_KEY,
      onBuildLogs: defaultBuildLogger(),
    }
  );

  logger.info(
    {
      name: build.name,
      templateId: build.templateId,
      buildId: build.buildId,
    },
    '[sandbox] Built e2b template'
  );
}

void main().catch((error: unknown) => {
  logger.error(
    { error: error instanceof Error ? error.message : String(error) },
    '[sandbox] Failed to build e2b template'
  );
  process.exit(1);
});
