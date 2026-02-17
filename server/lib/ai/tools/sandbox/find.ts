import { tool } from 'ai';
import { z } from 'zod';
import logger from '~/lib/logger';
import {
  resolveCwd,
  type SandboxToolDeps,
  setToolStatus,
  shellEscape,
} from './_shared';
import { DEFAULT_MAX_BYTES, formatSize, truncateHead } from './truncate';

const DEFAULT_LIMIT = 1000;

export const findFiles = ({ context, sandbox }: SandboxToolDeps) =>
  tool({
    description:
      'Find files by glob pattern with fd and return relative paths.',
    inputSchema: z.object({
      pattern: z
        .string()
        .min(1)
        .describe('Glob pattern like "*.ts" or "src/**/*.spec.ts".'),
      cwd: z
        .string()
        .optional()
        .describe('Directory to search. Defaults to sandbox workdir.'),
      limit: z
        .number()
        .int()
        .positive()
        .max(5000)
        .default(DEFAULT_LIMIT)
        .describe('Maximum number of file results.'),
      description: z
        .string()
        .min(4)
        .max(80)
        .default('is finding files')
        .describe('Status text in format: is <doing something>.'),
    }),
    execute: async ({ pattern, cwd, limit, description }) => {
      await setToolStatus(context, description);
      const baseDir = resolveCwd(cwd);
      const safePattern = shellEscape(pattern);
      const safeBaseDir = shellEscape(baseDir);
      const safeLimit = String(limit);
      const command = [
        'bash -lc',
        shellEscape(
          `cd ${safeBaseDir} && ` +
            `fd --glob --hidden --color never --max-results ${safeLimit} ${safePattern} . | sed 's#^./##'`
        ),
      ].join(' ');

      logger.info(
        {
          input: { pattern, cwd: baseDir, limit, description },
        },
        '[subagent] finding files'
      );

      try {
        const result = await sandbox.commands.run(command, { cwd: baseDir });
        const lines = result.stdout
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line.length > 0);

        const outputText = lines.join('\n');
        const truncation = truncateHead(outputText, {
          maxLines: Number.MAX_SAFE_INTEGER,
          maxBytes: DEFAULT_MAX_BYTES,
        });

        const notices: string[] = [];
        if (lines.length >= limit) {
          notices.push(
            `${limit} results limit reached. Increase limit or refine pattern.`
          );
        }
        if (truncation.truncated) {
          notices.push(
            `${formatSize(DEFAULT_MAX_BYTES)} output limit reached.`
          );
        }

        const output = {
          success: result.exitCode === 0 || lines.length > 0,
          matches: lines.slice(0, limit),
          count: lines.length,
          output:
            notices.length > 0 && truncation.content.length > 0
              ? `${truncation.content}\n\n[${notices.join(' ')}]`
              : truncation.content,
          truncated: truncation.truncated,
          stderr: result.stderr.trim(),
        };

        logger.info({ output }, '[subagent] find files');
        return output;
      } catch (error) {
        logger.error(
          { error, pattern, cwd: baseDir },
          '[sandbox-tool] Find failed'
        );
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });
