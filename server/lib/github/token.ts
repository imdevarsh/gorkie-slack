import { createAppAuth } from '@octokit/auth-app';
import { env } from '~/env';
import logger from '~/lib/logger';
import { toLogError } from '~/utils/error';

export async function createToken(): Promise<string> {
  const auth = createAppAuth({
    appId: env.GITHUB_APP_ID,
    privateKey: Buffer.from(env.GITHUB_APP_PRIVATE_KEY, 'base64').toString(
      'utf8'
    ),
    installationId: env.GITHUB_APP_INSTALLATION_ID,
  });

  const { token } = await auth({ type: 'installation' });

  logger.debug('[github] Created installation token');
  return token;
}

export async function revokeToken(token: string): Promise<void> {
  try {
    await fetch('https://api.github.com/installation/token', {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    logger.debug('[github] Revoked installation token');
  } catch (error) {
    logger.warn(
      { ...toLogError(error) },
      '[github] Failed to revoke installation token'
    );
  }
}
