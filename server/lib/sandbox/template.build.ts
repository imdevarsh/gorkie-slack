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
          'fd-find',
          'ripgrep',
          'imagemagick',
          'ffmpeg',
          'python3-pip',
          'python3-pil',
        ],
        { noInstallRecommends: true }
      )
      .runCmd([
        'if command -v fdfind >/dev/null 2>&1; then ln -sf "$(command -v fdfind)" /usr/local/bin/fd; fi',
        'python3 -m pip install --no-cache-dir --upgrade pip',
        'python3 -m pip install --no-cache-dir pillow',
        'mkdir -p /home/user/attachments /home/user/output /home/user/agent/turns',
        'chown -R user:user /home/user/attachments /home/user/output /home/user/agent',
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
    {
      name: build.name,
      templateId: build.templateId,
      buildId: build.buildId,
    },
    '[sandbox] Built E2B template'
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

  logger.info(
    {
      name: normalized,
      templateName: normalized,
    },
    '[sandbox] Building missing E2B template'
  );

  const promise = buildTemplate(normalized);
  buildPromises.set(normalized, promise);

  try {
    return await promise;
  } finally {
    buildPromises.delete(normalized);
  }
}
