import { tool } from 'ai';
import { z } from 'zod';
import { sandbox as config } from '~/config';
import { createTask, finishTask } from '~/lib/ai/utils/task';
import logger from '~/lib/logger';
import { getContextId } from '~/utils/context';
import { errorMessage, toLogError } from '~/utils/error';
import {
  resolveCwd,
  type SandboxToolDeps,
  shellEscape,
  truncate,
} from './_shared';

export const globFiles = ({ context, sandbox, stream }: SandboxToolDeps) =>
  tool({
    description: 'Find files matching a glob-like path pattern.',
    inputSchema: z.object({
      pattern: z
        .string()
        .min(1)
        .describe('Glob-like pattern. Example: **/*.ts or output/*.png'),
      cwd: z
        .string()
        .optional()
        .describe('Directory to search from. Defaults to sandbox workdir.'),
      description: z
        .string()
        .min(4)
        .max(80)
        .default('Finding files')
        .describe(
          'Brief title for this operation, e.g. "Finding TypeScript files", "Listing output files".'
        ),
    }),
    execute: async ({ pattern, cwd, description }) => {
      const ctxId = getContextId(context);
      const task = await createTask(stream, {
        title: description,
        details: `\`\`\`${pattern}\`\`\``,
      });

      const baseDir = resolveCwd(cwd);
      logger.info(
        {
          ctxId,
          input: { pattern, cwd: baseDir, description },
        },
        '[subagent] finding files'
      );
      const safePattern = shellEscape(pattern);
      const command = [
        'bash -lc',
        shellEscape(
          `cd ${shellEscape(baseDir)} && ` +
            `fd --glob --strip-cwd-prefix --hidden --no-ignore ${safePattern} .`
        ),
      ].join(' ');

      try {
        const result = await sandbox.commands.run(command, {
          cwd: baseDir,
        });

        const stdout = truncate(result.stdout, config.maxToolOutput);
        const matches = stdout
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line.length > 0);

        const output = {
          success: result.exitCode === 0,
          matches,
          count: matches.length,
          truncated: result.stdout.length > config.maxToolOutput,
          stderr: truncate(result.stderr, config.maxToolOutput),
        };

        logger.info(
          {
            ctxId,
            output,
          },
          '[subagent] glob files'
        );

        await finishTask(
          stream,
          task,
          output.success ? 'complete' : 'error',
          `${output.count} file(s) found`
        );
        return output;
      } catch (error) {
        logger.warn(
          {
            ctxId,
            output: {
              success: false,
              error: errorMessage(error),
            },
          },
          '[subagent] glob files'
        );

        logger.error(
          { ...toLogError(error), ctxId, pattern, cwd: baseDir },
          '[sandbox-tool] Glob failed'
        );
        await finishTask(stream, task, 'error', errorMessage(error));
        return {
          success: false,
          error: errorMessage(error),
        };
      }
    },
  });
