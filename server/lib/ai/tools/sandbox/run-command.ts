import { tool } from 'ai';
import { z } from 'zod';
import logger from '~/lib/logger';
import {
  resolveCwd,
  resolveTimeout,
  type SandboxToolDeps,
  setToolStatus,
  truncate,
} from './_shared';

const MAX_OUTPUT_CHARS = 20_000;

export const runCommand = ({ context, sandbox }: SandboxToolDeps) =>
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

      try {
        const result = await sandbox.commands.run(command, {
          cwd: resolvedCwd,
          timeoutMs: resolvedTimeout,
        });

        const durationMs = Date.now() - startedAt;
        const stdout = truncate(result.stdout, MAX_OUTPUT_CHARS);
        const stderr = truncate(result.stderr, MAX_OUTPUT_CHARS);

        logger.info(
          {
            tool: 'runCommand',
            cwd: resolvedCwd,
            timeoutMs: resolvedTimeout,
            exitCode: result.exitCode,
            durationMs,
          },
          '[sandbox-tool] Command completed'
        );

        return {
          success: result.exitCode === 0,
          exitCode: result.exitCode,
          stdout,
          stderr,
          durationMs,
        };
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

          logger.warn(
            {
              tool: 'runCommand',
              cwd: resolvedCwd,
              timeoutMs: resolvedTimeout,
              exitCode: commandError.exitCode,
              durationMs,
            },
            '[sandbox-tool] Command exited with error'
          );

          return {
            success: false,
            exitCode: commandError.exitCode,
            stdout: truncate(commandError.stdout, MAX_OUTPUT_CHARS),
            stderr: truncate(commandError.stderr, MAX_OUTPUT_CHARS),
            durationMs,
          };
        }

        logger.error(
          {
            error,
            tool: 'runCommand',
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
