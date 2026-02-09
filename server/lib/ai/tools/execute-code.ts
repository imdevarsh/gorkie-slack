import { Sandbox } from '@vercel/sandbox';
import { tool } from 'ai';
import { z } from 'zod';
import logger from '~/lib/logger';

export const executeCode = () =>
  tool({
    description:
      'Execute JavaScript code in a sandboxed Node.js 22 environment. THIS IS NOT A REPL - NO OUTPUT WILL BE SHOWN UNLESS YOU USE console.log(). Every value you want to see MUST be wrapped in console.log(). Use for calculations, data processing, or demonstrating code.',
    inputSchema: z.object({
      code: z
        .string()
        .describe(
          'JavaScript code to execute. MANDATORY: ALL values must be wrapped in console.log() to produce output. Bare expressions produce NOTHING. Example: console.log(2 + 2), console.log(JSON.stringify(data, null, 2))'
        ),
    }),
    execute: async ({ code }) => {
      if (!(code.includes('console.log(') || code.includes('console.log ('))) {
        return {
          output:
            'ERROR: You MUST include a console.log() statement to see output. Bare expressions produce no output. Wrap your expressions in console.log().',
          exitCode: 1,
          stderr: 'No console.log() statement detected in code',
        };
      }

      try {
        const sandbox = await Sandbox.create({
          runtime: 'node22',
        });

        logger.debug(
          { codePreview: code.substring(0, 100) },
          'Executing code in sandbox'
        );

        const runResult = await sandbox.runCommand({
          cmd: 'node',
          args: ['-e', code],
        });

        const output = await runResult.stdout();
        const errorOutput = await runResult.stderr();

        logger.debug(
          { exitCode: runResult.exitCode, hasError: !!errorOutput },
          'Sandbox execution completed'
        );

        await sandbox.stop();

        if (!output && runResult.exitCode === 0) {
          return {
            output:
              'Code executed successfully but produced no output. Make sure to use console.log() to display results.',
            exitCode: runResult.exitCode,
            stderr: errorOutput,
          };
        }

        return {
          output: output || errorOutput,
          exitCode: runResult.exitCode,
          stderr: errorOutput,
        };
      } catch (error) {
        logger.error({ error }, 'Sandbox code execution failed');
        return {
          output: '',
          exitCode: 1,
          stderr: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });
