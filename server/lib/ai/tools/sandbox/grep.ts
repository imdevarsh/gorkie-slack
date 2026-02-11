import { tool } from 'ai';
import { z } from 'zod';
import { setStatus } from '~/lib/ai/utils/status';
import logger from '~/lib/logger';
import { getSandbox } from '~/lib/sandbox';
import type { SlackMessageContext } from '~/types';
import { getContextId } from '~/utils/context';

interface RgMatch {
  type: 'match';
  data: {
    path: { text: string };
    lines: { text: string };
    line_number: number;
  };
}

export const grep = ({ context }: { context: SlackMessageContext }) =>
  tool({
    description: 'Search file contents in the sandbox using a regex pattern.',
    inputSchema: z.object({
      pattern: z.string().describe('Regex pattern to search for'),
      path: z
        .string()
        .default('.')
        .describe('Directory path in sandbox (relative, default: .)'),
      include: z
        .string()
        .optional()
        .describe('Glob pattern to filter files (e.g. "*.ts", "*.{ts,tsx}")'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(500)
        .default(100)
        .describe('Max matches to return (default: 100, max: 500)'),
      status: z
        .string()
        .optional()
        .describe('Status text formatted like "is xyz"'),
    }),
    execute: async ({ pattern, path, include, limit, status }) => {
      await setStatus(context, {
        status: status ?? 'is searching files',
        loading: true,
      });

      const ctxId = getContextId(context);

      try {
        const sandbox = await getSandbox(ctxId, context);

        const args = [
          '--json',
          '--max-columns',
          '2000',
          '--max-columns-preview',
          '--glob',
          '!node_modules',
          '--glob',
          '!.git',
          '--glob',
          '!.venv',
          '--glob',
          '!venv',
        ];

        if (include) {
          args.push('--glob', include);
        }

        args.push('--', pattern, path);

        const result = await sandbox.runCommand({ cmd: 'rg', args });

        const stdout = await result.stdout();
        const stderr = await result.stderr();

        if (result.exitCode !== 0 && result.exitCode !== 1) {
          return {
            success: false,
            error: stderr || `Failed to search: ${pattern}`,
          };
        }

        const matches = parseRgJson(stdout, limit);
        const truncated = matches.truncated;
        const output = formatMatches(matches.entries);

        logger.debug(
          { ctxId, pattern, path, include, count: matches.entries.length },
          `Found ${matches.entries.length} matches for ${pattern}`
        );

        return {
          success: true,
          path,
          count: matches.entries.length,
          truncated,
          output,
        };
      } catch (error) {
        logger.error(
          { ctxId, error, pattern, path },
          `Grep failed for pattern ${pattern}`
        );
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });

interface MatchEntry {
  file: string;
  line: number;
  text: string;
}

function parseRgJson(
  stdout: string,
  limit: number
): { entries: MatchEntry[]; truncated: boolean } {
  if (!stdout.trim()) {
    return { entries: [], truncated: false };
  }

  const entries: MatchEntry[] = [];
  let truncated = false;

  for (const line of stdout.split('\n')) {
    if (!line.trim()) {
      continue;
    }

    let parsed: { type: string; data: RgMatch['data'] };
    try {
      parsed = JSON.parse(line) as { type: string; data: RgMatch['data'] };
    } catch {
      continue;
    }

    if (parsed.type !== 'match') {
      continue;
    }

    const text = parsed.data.lines.text.trimEnd();
    entries.push({
      file: parsed.data.path.text,
      line: parsed.data.line_number,
      text: text.length > 2000 ? `${text.slice(0, 2000)}...` : text,
    });

    if (entries.length >= limit) {
      truncated = true;
      break;
    }
  }

  return { entries, truncated };
}

function formatMatches(entries: MatchEntry[]): string {
  if (entries.length === 0) {
    return 'No files found';
  }

  const lines: string[] = [`Found ${entries.length} matches`];
  let currentFile = '';

  for (const entry of entries) {
    if (entry.file !== currentFile) {
      if (currentFile) {
        lines.push('');
      }
      currentFile = entry.file;
      lines.push(`${entry.file}:`);
    }
    lines.push(`  Line ${entry.line}: ${entry.text}`);
  }

  return lines.join('\n');
}
