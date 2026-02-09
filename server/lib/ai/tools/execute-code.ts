import { Sandbox } from '@vercel/sandbox';
import { tool } from 'ai';
import { z } from 'zod';
import { redis, redisKeys } from '~/lib/kv';
import logger from '~/lib/logger';
import type { SlackMessageContext } from '~/types';

const SANDBOX_TTL_SECONDS = 10 * 60;
const SANDBOX_TIMEOUT_MS = 10 * 60 * 1000;

function getContextId(context: SlackMessageContext): string {
  const channel = context.event.channel ?? 'unknown-channel';
  const channelType = context.event.channel_type;
  const userId = (context.event as { user?: string }).user;
  const threadTs = (context.event as { thread_ts?: string }).thread_ts;

  if (channelType === 'im' && userId) {
    return `dm:${userId}`;
  }
  if (threadTs) {
    return `${channel}:${threadTs}`;
  }
  return channel;
}

async function reconnect(ctxId: string): Promise<Sandbox | null> {
  const sandboxId = await redis.get(redisKeys.sandbox(ctxId));
  if (!sandboxId) {
    return null;
  }

  try {
    const sandbox = await Sandbox.get({ sandboxId });
    if (sandbox.status === 'running') {
      return sandbox;
    }
  } catch {
    // sandbox expired or unreachable
  }

  await redis.del(redisKeys.sandbox(ctxId));
  return null;
}

async function getOrCreate(ctxId: string): Promise<Sandbox> {
  const existing = await reconnect(ctxId);
  if (existing) {
    await redis.expire(redisKeys.sandbox(ctxId), SANDBOX_TTL_SECONDS);
    return existing;
  }

  const sandbox = await Sandbox.create({
    runtime: 'node22',
    timeout: SANDBOX_TIMEOUT_MS,
  });

  await redis.set(redisKeys.sandbox(ctxId), sandbox.sandboxId);
  await redis.expire(redisKeys.sandbox(ctxId), SANDBOX_TTL_SECONDS);

  logger.info({ sandboxId: sandbox.sandboxId, ctxId }, 'Created sandbox');
  return sandbox;
}

export const executeCode = ({ context }: { context: SlackMessageContext }) =>
  tool({
    description:
      'Run a shell command in a sandboxed Linux VM (Node 22, Amazon Linux). Persists per thread — installed tools and files carry over between calls. Supports bash, node, python, curl, npm, dnf.',
    inputSchema: z.object({
      command: z.string().describe('Shell command (runs via sh -c)'),
    }),
    execute: async ({ command }) => {
      const ctxId = getContextId(context);

      try {
        const sandbox = await getOrCreate(ctxId);

        const result = await sandbox.runCommand({
          cmd: 'sh',
          args: ['-c', command],
        });

        const stdout = await result.stdout();
        const stderr = await result.stderr();

        return {
          stdout: stdout || '(no output)',
          stderr,
          exitCode: result.exitCode,
        };
      } catch (error) {
        logger.error({ error, ctxId }, 'Sandbox command failed');
        await redis.del(redisKeys.sandbox(ctxId));

        return {
          stdout: '',
          stderr: error instanceof Error ? error.message : String(error),
          exitCode: 1,
        };
      }
    },
  });
