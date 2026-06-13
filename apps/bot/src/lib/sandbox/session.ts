import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
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
  const parsed: unknown = JSON.parse(value);

  if (
    parsed &&
    typeof parsed === 'object' &&
    'state' in parsed &&
    parsed.state &&
    typeof parsed.state === 'object'
  ) {
    return parsed.state as HarnessAgentResumeSessionState;
  }

  return parsed as HarnessAgentResumeSessionState;
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
  if (/\bpi\b|coding agent|badlogic|pi-mono/i.test(prompt)) {
    throw new Error('Sandbox prompt contains provider-blocked terms.');
  }
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
      const safeSessionId = ctxId.replace(/[\\/: ]/g, '-');
      const hostAgentDir = path.join(
        tmpdir(),
        'ai-sdk-harness',
        'pi',
        safeSessionId,
        'agent'
      );
      const systemPromptPath = `${sessionWorkDir}/.pi/SYSTEM.md`;
      const legacySystemPromptPath = `${sessionWorkDir}/.pi/SYSTEM`;
      await mkdir(hostAgentDir, { recursive: true });
      await writeFile(path.join(hostAgentDir, 'SYSTEM.md'), prompt);
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
        path: systemPromptPath,
      });
      await session.writeTextFile({
        abortSignal,
        content: prompt,
        path: legacySystemPromptPath,
      });
      const writtenPrompt = await session.readTextFile({
        abortSignal,
        path: systemPromptPath,
      });
      const writtenLegacyPrompt = await session.readTextFile({
        abortSignal,
        path: legacySystemPromptPath,
      });
      if (writtenPrompt !== prompt || writtenLegacyPrompt !== prompt) {
        throw new Error('Sandbox system prompt override was not written.');
      }
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
