import type { Sandbox } from '@e2b/code-interpreter';
import { stepCountIs, ToolLoopAgent } from 'ai';
import { systemPrompt } from '~/lib/ai/prompts';
import { provider } from '~/lib/ai/providers';
import {
  bash,
  editFile,
  extendSandboxTimeout,
  findFiles,
  grepFiles,
  listFiles,
  readFile,
  showFile,
  writeFile,
} from '~/lib/ai/tools/sandbox';
import logger from '~/lib/logger';
import type { SandboxRequestHints, SlackMessageContext } from '~/types';

export const sandboxAgent = ({
  context,
  sandbox,
  requestHints,
}: {
  context: SlackMessageContext;
  sandbox: Sandbox;
  requestHints?: SandboxRequestHints;
}) =>
  new ToolLoopAgent({
    model: provider.languageModel('agent-model'),
    instructions: systemPrompt({
      agent: 'sandbox',
      context,
      requestHints,
    }),
    tools: {
      bash: bash({ context, sandbox }),
      readFile: readFile({ context, sandbox }),
      writeFile: writeFile({ context, sandbox }),
      editFile: editFile({ context, sandbox }),
      listFiles: listFiles({ context, sandbox }),
      findFiles: findFiles({ context, sandbox }),
      grepFiles: grepFiles({ context, sandbox }),
      showFile: showFile({ context, sandbox }),
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
      functionId: 'sandbox-agent',
    },
  });
