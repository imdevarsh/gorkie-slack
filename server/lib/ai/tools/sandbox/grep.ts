import { tool } from 'ai';
import { z } from 'zod';
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

const MAX_OUTPUT_CHARS = 20_000;

export const grepFiles = ({ context, sandbox, stream }: SandboxToolDeps) =>
  tool({
    description: 'Search file contents with ripgrep (or grep fallback).',
    inputSchema: z.object({
      pattern: z.string().min(1).describe('Regex pattern to search for.'),
      cwd: z
        .string()
        .optional()
        .describe('Search root directory. Defaults to sandbox workdir.'),
      description: z
        .string()
        .min(4)
        .max(80)
        .default('Searching files')
        .describe(
          'Brief title for this operation, e.g. "Searching for imports", "Finding function references".'
        ),
    }),
    execute: async ({ pattern, cwd, description }) => {
      const ctxId = getContextId(context);
      const task = await createTask(stream, {
        title: description,
        details: pattern,
      });

      const baseDir = resolveCwd(cwd);
      logger.info(
        {
          ctxId,
          input: { pattern, cwd: baseDir, description },
        },
        '[subagent] searching files'
      );
      const safePattern = shellEscape(pattern);
      const command = [
        'bash -lc',
        shellEscape(
          `cd ${shellEscape(baseDir)} && if command -v rg >/dev/null 2>&1; then rg --line-number --no-heading --color never ${safePattern} .; else grep -R -n --binary-files=without-match -E ${safePattern} .; fi`
        ),
      ].join(' ');

      try {
        const result = await sandbox.commands.run(command, {
          cwd: baseDir,
        });

        const stdout = truncate(result.stdout, MAX_OUTPUT_CHARS);
        const matches = stdout
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line.length > 0);

        const output = {
          success: result.exitCode === 0 || matches.length > 0,
          count: matches.length,
          output: stdout,
          truncated: result.stdout.length > MAX_OUTPUT_CHARS,
          stderr: truncate(result.stderr, MAX_OUTPUT_CHARS),
        };

        logger.info(
          {
            ctxId,
            output,
          },
          '[subagent] grep files'
        );

        await finishTask(
          stream,
          task,
          output.success ? 'complete' : 'error',
          `${output.count} match(es)`
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
          '[subagent] grep files'
        );

        logger.error(
          { ...toLogError(error), ctxId, pattern, cwd: baseDir },
          '[sandbox-tool] Grep search failed'
        );

        await finishTask(stream, task, 'error', errorMessage(error));
        return {
          success: false,
          error: errorMessage(error),
        };
      }
    },
  });
