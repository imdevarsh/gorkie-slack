import type { HarnessV1SandboxProvider } from '@ai-sdk/harness';
import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createPi } from '@ai-sdk/harness-pi';
import type { ToolSet } from 'ai';
import { sessionIdFromWorkDir, syncSession } from './files/session';
import { writeSystemPrompt } from './files/system';
import { CHAT_MODEL, HACKCLUB_BASE_URL } from './providers';
import type { SandboxContext } from './types';

export function createAgent({
  apiKey,
  onSandboxReady,
  sandbox,
  systemPrompt,
  tools,
}: {
  apiKey: string;
  onSandboxReady?: (input: SandboxContext) => PromiseLike<void> | void;
  sandbox: HarnessV1SandboxProvider;
  systemPrompt: string;
  tools: ToolSet;
}) {
  return new HarnessAgent({
    harness: createPi({
      auth: {
        customEnv: {
          OPENROUTER_API_KEY: apiKey,
          OPENROUTER_BASE_URL: HACKCLUB_BASE_URL,
        },
      },
      model: CHAT_MODEL,
      thinkingLevel: 'medium',
    }),
    id: 'gorkie',
    permissionMode: 'allow-all',
    sandbox,
    tools,
    onSandboxSession: async ({ abortSignal, session, sessionWorkDir }) => {
      await onSandboxReady?.({ session, sessionWorkDir });
      const sessionId = sessionIdFromWorkDir(sessionWorkDir);
      await writeSystemPrompt({ sessionId, systemPrompt });
      await syncSession({
        abortSignal,
        session,
        sessionId,
        sessionWorkDir,
      });
    },
  });
}

export type Agent = ReturnType<typeof createAgent>;
