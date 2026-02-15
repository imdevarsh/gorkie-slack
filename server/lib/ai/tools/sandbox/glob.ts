import { tool } from 'ai';
import { z } from 'zod';
import logger from '~/lib/logger';
import {
  resolveCwd,
  type SandboxToolDeps,
  setToolStatus,
  shellEscape,
  truncate,
} from './_shared';

const MAX_OUTPUT_CHARS = 20_000;

export const globFiles = ({ context, sandbox }: SandboxToolDeps) =>
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
        .default('is finding files')
        .describe('Status text in format: is <doing something>.'),
    }),
    execute: async ({ pattern, cwd, description }) => {
      await setToolStatus(context, description);

      const baseDir = resolveCwd(cwd);
      logger.info(
        {
          input: { pattern, cwd: baseDir, description },
        },
        '[subagent] finding files'
      );
      const command = [
        'bash -lc',
        shellEscape(
          `cd ${shellEscape(baseDir)} && ` +
            `find . -path ${shellEscape(`./${pattern}`)} -print | sed 's#^./##'`
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
          success: result.exitCode === 0,
          matches,
          count: matches.length,
          truncated: result.stdout.length > MAX_OUTPUT_CHARS,
          stderr: truncate(result.stderr, MAX_OUTPUT_CHARS),
        };

        logger.info(
          {
            output,
          },
          '[subagent] glob files'
        );

        return output;
      } catch (error) {
        logger.warn(
          {
            output: {
              success: false,
              error: error instanceof Error ? error.message : String(error),
            },
          },
          '[subagent] glob files'
        );

        logger.error(
          { error, pattern, cwd: baseDir },
          '[sandbox-tool] Glob failed'
        );
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });
