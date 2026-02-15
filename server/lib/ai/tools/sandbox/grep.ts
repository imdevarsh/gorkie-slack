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

export const grepFiles = ({ context, sandbox }: SandboxToolDeps) =>
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
        .default('is searching files')
        .describe('Status text in format: is <doing something>.'),
    }),
    execute: async ({ pattern, cwd, description }) => {
      await setToolStatus(context, description);

      const baseDir = resolveCwd(cwd);
      logger.info(
        {
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
            output,
          },
          '[subagent] grep files'
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
          '[subagent] grep files'
        );

        logger.error(
          { error, pattern, cwd: baseDir },
          '[sandbox-tool] Grep search failed'
        );

        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });
