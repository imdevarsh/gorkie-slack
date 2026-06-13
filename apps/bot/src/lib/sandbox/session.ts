import {
  HarnessAgent,
  type HarnessAgentAdapter,
  type HarnessAgentResumeSessionState,
  type HarnessAgentSession,
} from '@ai-sdk/harness/agent';
import { createPi } from '@ai-sdk/harness-pi';
import { systemPrompt } from '@repo/ai/prompts';
import { getByThread, updateResumeState } from '@repo/db/queries';
import { sandbox as config } from '@/config';
import { env } from '@/env';
import type {
  PromptResourceLink,
  SlackFile,
  SlackMessageContext,
} from '@/types';
import { getContextId } from '@/utils/context';
import { syncAttachments } from './attachments';
import { createE2BSandboxProvider } from './e2b-provider';
import { createSandboxTools } from './tools';

const e2bProvider = createE2BSandboxProvider({ template: config.template });

function parseResumeState(
  value: string | null
): HarnessAgentResumeSessionState | undefined {
  if (!value) {
    return;
  }
  return JSON.parse(value) as HarnessAgentResumeSessionState;
}

function createSandboxAgent({
  context,
  ctxId,
  files,
  onUploads,
}: {
  context: SlackMessageContext;
  ctxId: string;
  files?: SlackFile[];
  onUploads: (uploads: PromptResourceLink[]) => void;
}): HarnessAgent {
  const prompt = systemPrompt({ agent: 'sandbox', context });
  const harness = createPi({
    auth: {
      customEnv: {
        OPENROUTER_API_KEY: env.HACKCLUB_API_KEY,
        OPENROUTER_BASE_URL: 'https://ai.hackclub.com/proxy/v1',
      },
    },
    model: config.model.modelId,
    thinkingLevel: 'medium',
  }) as unknown as HarnessAgentAdapter;

  return new HarnessAgent({
    harness,
    id: 'gorkie-sandbox',
    permissionMode: 'allow-all',
    sandbox: e2bProvider,
    tools: createSandboxTools({ context, ctxId }),
    onSandboxSession: async ({ abortSignal, session, sessionWorkDir }) => {
      await session.run({
        abortSignal,
        command: [
          `mkdir -p ${JSON.stringify(`${sessionWorkDir}/.pi`)}`,
          `mkdir -p ${JSON.stringify(`${sessionWorkDir}/attachments`)}`,
          `mkdir -p ${JSON.stringify(`${sessionWorkDir}/output`)}`,
          `mkdir -p ${JSON.stringify(config.runtime.workdir)}/attachments`,
          `mkdir -p ${JSON.stringify(config.runtime.workdir)}/output`,
        ].join(' && '),
      });
      await session.writeTextFile({
        abortSignal,
        content: prompt,
        path: `${sessionWorkDir}/.pi/SYSTEM.md`,
      });
      onUploads(await syncAttachments(session, context, files));
    },
  });
}

export interface ResolvedSandboxRuntime {
  agent: ReturnType<typeof createSandboxAgent>;
  session: HarnessAgentSession;
  threadId: string;
  uploads: PromptResourceLink[];
}

export async function resolveSession(
  context: SlackMessageContext,
  files?: SlackFile[]
): Promise<ResolvedSandboxRuntime> {
  const threadId = getContextId(context);
  const existing = await getByThread(threadId);
  let uploads: PromptResourceLink[] = [];
  const agent = createSandboxAgent({
    context,
    ctxId: threadId,
    files,
    onUploads: (nextUploads) => {
      uploads = nextUploads;
    },
  });
  const resumeState = parseResumeState(existing?.resumeState ?? null);
  const session = await agent.createSession(
    resumeState
      ? { sessionId: threadId, resumeFrom: resumeState }
      : { sessionId: threadId }
  );

  return { agent, session, threadId, uploads };
}

export async function finishSession({
  runtime,
  status,
}: {
  runtime: ResolvedSandboxRuntime;
  status: 'active' | 'paused';
}): Promise<void> {
  const resumeState =
    status === 'paused'
      ? await runtime.session.stop()
      : await runtime.session.detach();

  await updateResumeState({
    resumeState: JSON.stringify(resumeState),
    status,
    threadId: runtime.threadId,
  });
}
