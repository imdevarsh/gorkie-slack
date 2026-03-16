import * as github from '~/lib/github';
import logger from '~/lib/logger';
import { toLogError } from '~/utils/error';

export interface SandboxTokens {
  github?: string;
}

export async function setupTokens(): Promise<SandboxTokens> {
  const [githubToken] = await Promise.allSettled([github.createToken()]);

  if (githubToken.status === 'rejected') {
    logger.error(
      { ...toLogError(githubToken.reason) },
      '[tokens] Failed to create GitHub token'
    );
  }

  return {
    github: githubToken.status === 'fulfilled' ? githubToken.value : undefined,
  };
}

export function tokensToEnvs(tokens: SandboxTokens): Record<string, string> {
  const envs: Record<string, string> = {};
  if (tokens.github) {
    envs.GH_TOKEN = tokens.github;
  }
  return envs;
}

export async function revokeTokens(tokens: SandboxTokens): Promise<void> {
  const entries = Object.entries(tokens) as [
    keyof SandboxTokens,
    string | undefined,
  ][];

  await Promise.all(
    entries.flatMap(([type, token]) => {
      if (!token) {
        return [];
      }
      switch (type) {
        case 'github':
          return [github.revokeToken(token)];
        default:
          return [];
      }
    })
  );
}
