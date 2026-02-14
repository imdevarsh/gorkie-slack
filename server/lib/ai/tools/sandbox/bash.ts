import { tool } from 'ai';
import { z } from 'zod';
import { setStatus } from '~/lib/ai/utils/status';
import logger from '~/lib/logger';
import { getSandbox } from '~/lib/sandbox';
import { appendSessionLog, truncateOutput } from '~/lib/sandbox/command-utils';
import { clearSandbox } from '~/lib/sandbox/queries';
import { sandboxPath } from '~/lib/sandbox/utils';
import type { SlackMessageContext } from '~/types';
import { getContextId } from '~/utils/context';

export const bash = ({ context }: { context: SlackMessageContext }) =>
  tool({
    description: 'Run a shell command.',
    inputSchema: z.object({
      command: z.string().describe('Shell command (runs via sh -c)'),
      workdir: z.string().optional().describe('Working directory (relative)'),
      status: z
        .string()
        .describe('Status text formatted like "is xyz"')
        .optional(),
    }),
    execute: async ({ command, workdir, status }) => {
      const ctxId = getContextId(context);

      try {
        const cwd = sandboxPath(workdir ?? '.');
        const sandbox = await getSandbox(context);

        await sandbox.process.executeCommand(
          `mkdir -p ${sandboxPath('output')}`,
          cwd
        );

        await setStatus(context, {
          status: status ?? 'is running commands in the sandbox',
          loading: true,
        });

        logger.debug(
          { ctxId, command, cwd },
          '[sandbox] Command execution started'
        );

        const result = await sandbox.process.executeCommand(command, cwd);
        const output = result.result;
        const exitCode = result.exitCode;

        await appendSessionLog(sandbox, {
          ts: new Date().toISOString(),
          command,
          workdir: cwd,
          exitCode,
          preview: output.slice(0, 400),
        });

        const out = await truncateOutput(sandbox, output || '(no output)');

        logger.debug(
          {
            ctxId,
            exitCode,
            out,
          },
          '[sandbox] Command execution completed'
        );

        return {
          output: out.text,
          error: '',
          exitCode,
          ...(out.truncated && out.outputPath
            ? { fullOutputPath: out.outputPath }
            : {}),
        };
      } catch (error) {
        logger.error({ error, command, ctxId }, '[sandbox] Command crashed');
        await clearSandbox(ctxId);

        return {
          output: '',
          error: error instanceof Error ? error.message : String(error),
          exitCode: 1,
        };
      }
    },
  });
