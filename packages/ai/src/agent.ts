import type {
  HarnessV1,
  HarnessV1PromptControl,
  HarnessV1SandboxProvider,
  HarnessV1Session,
} from '@ai-sdk/harness';
import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createPi } from '@ai-sdk/harness-pi';
import type { ToolSet } from 'ai';
import { syncSession } from './files/session';
import { loadTemplateSkills } from './files/skills';
import { writeSystemPrompt } from './files/system';
import type { SandboxContext } from './types';
import type { PiAttempt } from './types/providers';

export function createAgent({
  attempt,
  onPromptControl,
  onSandboxReady,
  sandbox,
  sessionId,
  systemPrompt,
  tools,
}: {
  attempt: PiAttempt;
  onPromptControl: (control: HarnessV1PromptControl | undefined) => void;
  onSandboxReady?: (input: SandboxContext) => PromiseLike<void> | void;
  sandbox: HarnessV1SandboxProvider;
  sessionId: string;
  systemPrompt: string;
  tools: ToolSet;
}) {
  const pi = createPi({
    auth: {
      customEnv: attempt.customEnv,
    },
    model: attempt.model,
    thinkingLevel: 'medium',
  });
  return new HarnessAgent({
    harness: capturePromptControl({ harness: pi, onPromptControl }),
    id: 'gorkie',
    permissionMode: 'allow-all',
    sandbox,
    tools,
    onSandboxSession: async ({ abortSignal, session, sessionWorkDir }) => {
      await onSandboxReady?.({ session, sessionWorkDir });
      await writeSystemPrompt({ sessionId, systemPrompt });
      await syncSession({ abortSignal, session, sessionId, sessionWorkDir });
    },
  });
}

export type Agent = ReturnType<typeof createAgent>;
export type PromptControl = HarnessV1PromptControl;

function capturePromptControl<TBuiltinTools extends ToolSet>({
  harness,
  onPromptControl,
}: {
  harness: HarnessV1<TBuiltinTools>;
  onPromptControl: (control: HarnessV1PromptControl | undefined) => void;
}): HarnessV1<TBuiltinTools> {
  return {
    ...harness,
    doStart: async (options) => {
      const configuredSkills = options.skills ?? [];
      const templateSkills = await loadTemplateSkills({
        abortSignal: options.abortSignal,
        session: options.sandboxSession.restricted(),
      });
      const session = await harness.doStart({
        ...options,
        skills: [
          ...configuredSkills,
          ...templateSkills.filter(
            (skill) =>
              !configuredSkills.some(
                (configuredSkill) => configuredSkill.name === skill.name
              )
          ),
        ],
      });
      const capture = (control: HarnessV1PromptControl) => {
        onPromptControl(control);
        Promise.resolve(control.done)
          .then(
            () => onPromptControl(undefined),
            () => onPromptControl(undefined)
          )
          .catch(() => undefined);
        return control;
      };
      const wrappedSession: HarnessV1Session = {
        ...session,
        doContinueTurn: async (turnOptions) =>
          capture(await session.doContinueTurn(turnOptions)),
        doPromptTurn: async (turnOptions) =>
          capture(await session.doPromptTurn(turnOptions)),
      };
      return wrappedSession;
    },
  };
}
