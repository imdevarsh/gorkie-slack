import type { Sandbox } from '@e2b/code-interpreter';
import { stepCountIs, ToolLoopAgent } from 'ai';
import { systemPrompt } from '~/lib/ai/prompts';
import { provider } from '~/lib/ai/providers';
import {
  bash,
  editFile,
  extendSandboxTimeout,
  globFiles,
  grepFiles,
  readFile,
  showFile,
  writeFile,
} from '~/lib/ai/tools/sandbox';
import logger from '~/lib/logger';
import type { SandboxRequestHints, SlackMessageContext, Stream } from '~/types';

export const sandboxAgent = ({
  context,
  sandbox,
  requestHints,
  stream,
}: {
  context: SlackMessageContext;
  sandbox: Sandbox;
  requestHints?: SandboxRequestHints;
  stream: Stream;
}) =>
  new ToolLoopAgent({
    model: provider.languageModel('agent-model'),
    instructions: systemPrompt({
      agent: 'sandbox',
      context,
      requestHints,
    }),
    tools: {
      bash: bash({ context, sandbox, stream }),
      readFile: readFile({ context, sandbox, stream }),
      writeFile: writeFile({ context, sandbox, stream }),
      editFile: editFile({ context, sandbox, stream }),
      globFiles: globFiles({ context, sandbox, stream }),
      grepFiles: grepFiles({ context, sandbox, stream }),
      showFile: showFile({ context, sandbox, stream }),
    },
    prepareStep: async ({ stepNumber }) => {
      try {
        await extendSandboxTimeout(sandbox);
      } catch (error) {
        logger.warn(
          {
            error,
            stepNumber,
            sandboxId: sandbox.sandboxId,
          },
          '[subagent] Failed to extend sandbox timeout before step'
        );
      }

      return {};
    },
    stopWhen: [stepCountIs(30)],
    experimental_telemetry: {
      isEnabled: true,
      functionId: 'sandbox',
    },
  });
