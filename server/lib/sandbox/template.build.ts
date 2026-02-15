import { defaultBuildLogger, Template } from 'e2b';
import { env } from '~/env';
import logger from '~/lib/logger';

const buildPromises = new Map<string, Promise<string>>();
const DEFAULT_TEMPLATE = 'gorkie-sandbox:latest';

function normalizeTemplateName(templateRef: string): string {
  const trimmed = templateRef.trim();
  const separator = trimmed.indexOf(':');
  return separator === -1 ? trimmed : trimmed.slice(0, separator);
}

async function buildTemplate(templateRef: string): Promise<string> {
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
    templateRef,
    {
      apiKey: env.E2B_API_KEY,
      onBuildLogs: defaultBuildLogger(),
    }
  );

  logger.info(
    {
      templateRef: build.name,
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

export async function buildTemplateIfMissing(
  templateRef: string
): Promise<string> {
  const normalized = templateRef.trim();
  const inFlight = buildPromises.get(normalized);
  if (inFlight) {
    return await inFlight;
  }

  logger.info(
    {
      templateRef: normalized,
      templateName: normalizeTemplateName(normalized),
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
