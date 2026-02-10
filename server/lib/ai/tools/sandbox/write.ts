import { tool } from 'ai';
import { z } from 'zod';
import { setStatus } from '~/lib/ai/utils/status';
import logger from '~/lib/logger';
import type { SlackMessageContext } from '~/types';
import { getContextId } from '~/utils/context';
import { getOrCreate } from './bash/sandbox';
import { toBase64Json } from './utils';

function toBase64(value: string): string {
  return Buffer.from(value).toString('base64');
}

export const write = ({ context }: { context: SlackMessageContext }) =>
  tool({
    description: 'Write a file to the sandbox filesystem.',
    inputSchema: z.object({
      path: z.string().describe('File path in sandbox (relative)'),
      content: z.string().describe('File contents'),
      status: z
        .string()
        .optional()
        .describe('Status text formatted like "is xyz"'),
    }),
    execute: async ({ path, content, status }) => {
      await setStatus(context, {
        status: status ?? 'is writing file',
        loading: true,
      });
      const ctxId = getContextId(context);

      try {
        logger.debug(
          { ctxId, path, contentBytes: Buffer.byteLength(content), status },
          'Sandbox write starting'
        );
        const sandbox = await getOrCreate(ctxId);
        const params = { path, content: toBase64(content) };
        const payload = toBase64Json(params);

        const result = await sandbox.runCommand({
          cmd: 'sh',
          args: ['-c', `PARAMS_B64='${payload}' python3 agent/bin/write.py`],
        });

        const stdout = await result.stdout();
        const stderr = await result.stderr();

        if (result.exitCode !== 0) {
          return {
            success: false,
            error: stderr || `Failed to write file: ${path}`,
          };
        }

        const response = {
          success: true,
          path,
          output: stdout.trim() || 'ok',
        };

        logger.debug(
          { ctxId, path, output: response.output },
          'Sandbox write complete'
        );

        return response;
      } catch (error) {
        logger.error({ error, path }, 'Failed to write file in sandbox');
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });
