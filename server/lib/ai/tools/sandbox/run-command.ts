import { tool } from 'ai';
import { z } from 'zod';
import logger from '~/lib/logger';
import {
  resolveCwd,
  resolveTimeout,
  type SandboxToolDeps,
  setToolStatus,
} from './_shared';
import { formatSize, truncateTail } from './truncate';

const MAX_COMMAND_CHARS = 500;

export const bash = ({ context, sandbox }: SandboxToolDeps) =>
  tool({
    description:
      'Run a shell command in the sandbox. Always set description in format: is <doing something>.',
    inputSchema: z.object({
      command: z.string().min(1).describe('Shell command to execute.'),
      description: z
        .string()
        .min(4)
        .max(80)
        .describe('Status text in format: is <doing something>.'),
      cwd: z.string().optional().describe('Working directory for command.'),
      timeoutMs: z
        .number()
        .int()
        .positive()
        .max(10 * 60 * 1000)
        .optional()
        .describe('Command timeout in milliseconds.'),
    }),
    execute: async ({ command, description, cwd, timeoutMs }) => {
      await setToolStatus(context, description);

      const startedAt = Date.now();
      const resolvedCwd = resolveCwd(cwd);
      const resolvedTimeout = resolveTimeout(timeoutMs);
      const commandPreview =
        command.length > MAX_COMMAND_CHARS
          ? `${command.slice(0, MAX_COMMAND_CHARS)}...`
          : command;
      const input = {
        command: commandPreview,
        description,
        timeoutMs: resolvedTimeout,
        workdir: resolvedCwd,
      };

      logger.info(
        {
          tool: 'bash',
          input,
        },
        '[subagent] Tool started'
      );

      try {
        const result = await sandbox.commands.run(command, {
          cwd: resolvedCwd,
          timeoutMs: resolvedTimeout,
        });

        const durationMs = Date.now() - startedAt;
        const stdoutTruncation = truncateTail(result.stdout);
        const stderrTruncation = truncateTail(result.stderr);

        const truncationNotice = stdoutTruncation.truncated
          ? `stdout truncated (${stdoutTruncation.truncatedBy ?? 'unknown'} limit ${formatSize(stdoutTruncation.maxBytes)} / ${stdoutTruncation.maxLines} lines)`
          : null;

        const output = {
          success: result.exitCode === 0,
          exitCode: result.exitCode,
          stdout:
            truncationNotice && stdoutTruncation.content.length > 0
              ? `${stdoutTruncation.content}\n\n[${truncationNotice}]`
              : stdoutTruncation.content,
          stderr: stderrTruncation.content,
          durationMs,
          truncated: stdoutTruncation.truncated || stderrTruncation.truncated,
        };

        logger.info(
          {
            tool: 'bash',
            status: 'completed',
            input,
            output,
          },
          '[subagent] Tool update'
        );

        return output;
      } catch (error) {
        const durationMs = Date.now() - startedAt;

        if (
          typeof error === 'object' &&
          error !== null &&
          'exitCode' in error &&
          'stdout' in error &&
          'stderr' in error
        ) {
          const commandError = error as {
            exitCode: number;
            stdout: string;
            stderr: string;
          };
          const stdoutTruncation = truncateTail(commandError.stdout);
          const stderrTruncation = truncateTail(commandError.stderr);

          return {
            success: false,
            exitCode: commandError.exitCode,
            stdout: stdoutTruncation.content,
            stderr: stderrTruncation.content,
            durationMs,
            truncated: stdoutTruncation.truncated || stderrTruncation.truncated,
          };
        }

        logger.error(
          {
            error,
            tool: 'bash',
            cwd: resolvedCwd,
            timeoutMs: resolvedTimeout,
            durationMs,
          },
          '[sandbox-tool] Command failed unexpectedly'
        );

        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          durationMs,
        };
      }
    },
  });
