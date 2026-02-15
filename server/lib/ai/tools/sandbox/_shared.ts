import type { Sandbox } from '@e2b/code-interpreter';
import { sandbox as config } from '~/config';
import { setStatus } from '~/lib/ai/utils/status';
import type { SlackMessageContext } from '~/types';

export interface SandboxToolDeps {
  context: SlackMessageContext;
  sandbox: Sandbox;
}

export function normalizeStatus(status: string): string {
  const trimmed = status.trim();
  const prefixed = trimmed.startsWith('is ') ? trimmed : `is ${trimmed}`;
  return prefixed.slice(0, 49);
}

export async function setToolStatus(
  context: SlackMessageContext,
  status: string
): Promise<void> {
  await setStatus(context, {
    status: normalizeStatus(status),
    loading: true,
  });
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) {
    return text;
  }

  return `${text.slice(0, max)}\n...truncated...`;
}

export function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function resolveCwd(cwd?: string): string {
  if (!(typeof cwd === 'string' && cwd.trim().length > 0)) {
    return config.paths.workdir;
  }

  return cwd;
}

export function resolveTimeout(timeoutMs?: number): number {
  if (!(typeof timeoutMs === 'number' && Number.isFinite(timeoutMs))) {
    return config.commandTimeoutMs;
  }

  return Math.max(1000, Math.min(timeoutMs, config.timeoutMs));
}
