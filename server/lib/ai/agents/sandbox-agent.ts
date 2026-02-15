import type { Sandbox } from '@e2b/code-interpreter';
import { stepCountIs, ToolLoopAgent } from 'ai';
import { sandboxPrompt } from '~/lib/ai/prompts/sandbox';
import { provider } from '~/lib/ai/providers';
import {
  bash,
  editFile,
  globFiles,
  grepFiles,
  readFile,
  showFile,
  writeFile,
} from '~/lib/ai/tools/sandbox';
import type { SlackMessageContext } from '~/types';

export const sandboxAgent = ({
  context,
  sandbox,
}: {
  context: SlackMessageContext;
  sandbox: Sandbox;
}) =>
  new ToolLoopAgent({
    model: provider.languageModel('agent-model'),
    instructions: sandboxPrompt(),
    tools: {
      bash: bash({ context, sandbox }),
      readFile: readFile({ context, sandbox }),
      writeFile: writeFile({ context, sandbox }),
      editFile: editFile({ context, sandbox }),
      globFiles: globFiles({ context, sandbox }),
      grepFiles: grepFiles({ context, sandbox }),
      showFile: showFile({ context, sandbox }),
    },
    stopWhen: [stepCountIs(30)],
    experimental_telemetry: {
      isEnabled: true,
      functionId: 'sandbox-agent',
    },
  });
