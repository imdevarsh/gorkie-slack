import { tool } from 'ai';
import { z } from 'zod';
import logger from '~/lib/logger';
import {
  resolveCwd,
  type SandboxToolDeps,
  setToolStatus,
  shellEscape,
} from './_shared';
import {
  DEFAULT_MAX_BYTES,
  formatSize,
  GREP_MAX_LINE_LENGTH,
  truncateHead,
  truncateLine,
} from './truncate';

const DEFAULT_LIMIT = 100;

export const grepFiles = ({ context, sandbox }: SandboxToolDeps) =>
  tool({
    description:
      'Search file contents with ripgrep. Returns file:line matches and supports include globs.',
    inputSchema: z.object({
      pattern: z.string().min(1).describe('Regex pattern to search for.'),
      cwd: z
        .string()
        .optional()
        .describe('Search root directory. Defaults to sandbox workdir.'),
      include: z
        .string()
        .optional()
        .describe('Optional glob filter like **/*.ts'),
      ignoreCase: z
        .boolean()
        .default(false)
        .describe('If true, run case-insensitive search.'),
      literal: z
        .boolean()
        .default(false)
        .describe('If true, treat pattern as a literal string.'),
      contextLines: z
        .number()
        .int()
        .min(0)
        .max(10)
        .default(0)
        .describe('Number of lines before/after each match.'),
      limit: z
        .number()
        .int()
        .positive()
        .max(2000)
        .default(DEFAULT_LIMIT)
        .describe('Maximum number of matches to return.'),
      description: z
        .string()
        .min(4)
        .max(80)
        .default('is searching files')
        .describe('Status text in format: is <doing something>.'),
    }),
    execute: async ({
      pattern,
      cwd,
      include,
      ignoreCase,
      literal,
      contextLines,
      limit,
      description,
    }) => {
      await setToolStatus(context, description);

      const baseDir = resolveCwd(cwd);
      logger.info(
        {
          input: {
            pattern,
            cwd: baseDir,
            include,
            ignoreCase,
            literal,
            contextLines,
            limit,
            description,
          },
        },
        '[subagent] searching files'
      );

      const rgParts: string[] = [
        'rg',
        '--line-number',
        '--no-heading',
        '--color',
        'never',
        '--hidden',
        '--max-count',
        String(limit),
      ];

      if (ignoreCase) {
        rgParts.push('--ignore-case');
      }
      if (literal) {
        rgParts.push('--fixed-strings');
      }
      if (contextLines > 0) {
        rgParts.push('-C', String(contextLines));
      }
      if (include && include.trim().length > 0) {
        rgParts.push('--glob', include.trim());
      }

      rgParts.push(pattern, '.');
      const escaped = rgParts.map((part) => shellEscape(part)).join(' ');

      const command = [
        'bash -lc',
        shellEscape(`cd ${shellEscape(baseDir)} && ${escaped}`),
      ].join(' ');

      try {
        const result = await sandbox.commands.run(command, {
          cwd: baseDir,
        });

        const rawLines = result.stdout
          .split('\n')
          .map((line) => line.trimEnd())
          .filter((line) => line.length > 0);

        const processedLines: string[] = [];
        let linesTruncated = false;
        for (const line of rawLines) {
          const truncated = truncateLine(line, GREP_MAX_LINE_LENGTH);
          linesTruncated = linesTruncated || truncated.wasTruncated;
          processedLines.push(truncated.text);
        }

        const outputText = processedLines.join('\n');
        const truncation = truncateHead(outputText, {
          maxLines: Number.MAX_SAFE_INTEGER,
          maxBytes: DEFAULT_MAX_BYTES,
        });

        const notices: string[] = [];
        if (rawLines.length >= limit) {
          notices.push(
            `${limit} matches limit reached. Increase limit or refine pattern.`
          );
        }
        if (truncation.truncated) {
          notices.push(
            `${formatSize(DEFAULT_MAX_BYTES)} output limit reached.`
          );
        }
        if (linesTruncated) {
          notices.push(
            `Some lines were truncated to ${GREP_MAX_LINE_LENGTH} characters.`
          );
        }

        const output = {
          success: result.exitCode === 0 || rawLines.length > 0,
          count: rawLines.length,
          output:
            notices.length > 0 && truncation.content.length > 0
              ? `${truncation.content}\n\n[${notices.join(' ')}]`
              : truncation.content,
          truncated: truncation.truncated || linesTruncated,
          stderr: result.stderr.trim(),
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
