import { defaultBuildLogger, Template } from 'e2b';
import { env } from '~/env';
import logger from '~/lib/logger';

const buildPromises = new Map<string, Promise<string>>();
const DEFAULT_TEMPLATE = 'gorkie-sandbox:latest';

async function buildTemplate(name: string): Promise<string> {
  const build = await Template.build(
    Template()
      .fromBaseImage()
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
        'python3 -m pip install --no-cache-dir pillow matplotlib numpy pandas requests',
        'npm install -g @mariozechner/pi-coding-agent',
        'npm install -g agent-browser && yes | agent-browser install --with-deps',
        'npx playwright install-deps chromium',
        'npx --yes skills add vercel-labs/agent-browser --yes --global',
        'mkdir -p /home/user/attachments /home/user/output',
        'chown -R user:user /home/user/attachments /home/user/output',
      ])
      .setUser('user')
      .setWorkdir('/home/user'),
    name,
    {
      apiKey: env.E2B_API_KEY,
      onBuildLogs: defaultBuildLogger(),
    }
  );

  logger.info(
    { name: build.name, templateId: build.templateId, buildId: build.buildId },
    '[sandbox] Built e2b template'
  );

  return build.name;
}

export function getTemplate(): string {
  return DEFAULT_TEMPLATE;
}

export async function buildTemplateIfMissing(name: string): Promise<string> {
  const normalized = name.trim();
  const exists = await Template.exists(normalized, { apiKey: env.E2B_API_KEY });

  if (exists) {
    return normalized;
  }

  const inFlight = buildPromises.get(normalized);
  if (inFlight) {
    return await inFlight;
  }

  logger.info({ name: normalized }, '[sandbox] Building missing e2b template');

  const promise = buildTemplate(normalized);
  buildPromises.set(normalized, promise);

  try {
    return await promise;
  } finally {
    buildPromises.delete(normalized);
  }
}
