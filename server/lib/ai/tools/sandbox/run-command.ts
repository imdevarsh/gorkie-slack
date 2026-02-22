import { CommandExitError, type CommandResult } from '@e2b/code-interpreter';
import { tool } from 'ai';
import { z } from 'zod';
import { sandbox as config } from '~/config';
import { createTask, finishTask, updateTask } from '~/lib/ai/utils/task';
import logger from '~/lib/logger';
import { getContextId } from '~/utils/context';
import { errorMessage, toLogError } from '~/utils/error';
import {
  resolveCwd,
  resolveTimeout,
  type SandboxToolDeps,
  truncate,
} from './_shared';

const MAX_COMMAND_CHARS = 500;

export const bash = ({ context, sandbox, stream }: SandboxToolDeps) =>
  tool({
    description: 'Run a shell command in the sandbox.',
    inputSchema: z.object({
      command: z.string().min(1).describe('Shell command to execute.'),
      description: z
        .string()
        .min(4)
        .max(80)
        .describe(
          'Brief title for this operation, e.g. "Running npm install", "Building project".'
        ),
      cwd: z.string().optional().describe('Working directory for command.'),
      timeoutMs: z
        .number()
        .int()
        .positive()
        .max(10 * 60 * 1000)
        .optional()
        .describe('Command timeout in milliseconds.'),
    }),
    onInputStart: async ({ toolCallId }) => {
      await createTask(stream, {
        taskId: toolCallId,
        title: 'Running command',
        status: 'pending',
      });
    },
    execute: async (
      { command, description, cwd, timeoutMs },
      { toolCallId }
    ) => {
      const ctxId = getContextId(context);
      const task = await updateTask(stream, {
        taskId: toolCallId,
        title: description,
        details: `input:\n${truncate(command, MAX_COMMAND_CHARS)}`,
        status: 'in_progress',
      });

      const startedAt = Date.now();
      const resolvedCwd = resolveCwd(cwd);
      const resolvedTimeout = resolveTimeout(timeoutMs);
      const commandPreview = truncate(command, MAX_COMMAND_CHARS);
      const input = {
        command: commandPreview,
        description,
        timeoutMs: resolvedTimeout,
        workdir: resolvedCwd,
      };

      logger.info(
        {
          ctxId,
          tool: 'bash',
          status: 'in_progress',
          input,
        },
        '[subagent] Tool started'
      );

      const handle = await sandbox.commands.run(command, {
        background: true,
        cwd: resolvedCwd,
        timeoutMs: resolvedTimeout,
      });

      let result: CommandResult;
      try {
        result = await handle.wait();
      } catch (error) {
        if (!(error instanceof CommandExitError)) {
          const durationMs = Date.now() - startedAt;
          logger.error(
            {
              ...toLogError(error),
              ctxId,
              tool: 'bash',
              cwd: resolvedCwd,
              timeoutMs: resolvedTimeout,
              durationMs,
            },
            '[sandbox-tool] Command failed unexpectedly'
          );
          await finishTask(stream, {
            status: 'error',
            taskId: task,
            output: errorMessage(error),
          });
          return {
            success: false,
            error: errorMessage(error),
            durationMs,
          };
        }
        result = error;
      }

      const durationMs = Date.now() - startedAt;
      const stdout = truncate(result.stdout, config.maxToolOutput);
      const stderr = truncate(result.stderr, config.maxToolOutput);

      logger.info(
        {
          ctxId,
          tool: 'bash',
          status: 'completed',
          input,
          output: {
            metadata: {
              description,
              exit: result.exitCode,
              durationMs,
              output: stdout,
              truncated: result.stdout.length > config.maxToolOutput,
            },
            output: stdout,
            stderr,
          },
        },
        '[subagent] Tool update'
      );

      const output = {
        success: result.exitCode === 0,
        exitCode: result.exitCode,
        stdout,
        stderr,
        durationMs,
      };
      const content =
        result.exitCode === 0
          ? // biome-ignore lint/style/noNestedTernary: This local mapping is concise and readable.
            stdout
            ? `output:\n${truncate(stdout, 300)}`
            : ''
          : stderr
            ? `error:\n${truncate(stderr, 300)}`
            : '';
      const outputText = [content, `*Exit code: ${result.exitCode}*`]
        .filter((section) => section.length > 0)
        .join('\n\n');
      await finishTask(stream, {
        status: output.success ? 'complete' : 'error',
        taskId: task,
        output: outputText,
      });
      return output;
    },
  });
