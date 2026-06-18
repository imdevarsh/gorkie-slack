import type { Experimental_SandboxSession } from '@ai-sdk/provider-utils';

export async function syncTemplateSkills({
  abortSignal,
  session,
  sessionWorkDir,
}: {
  abortSignal?: AbortSignal;
  session: Experimental_SandboxSession;
  sessionWorkDir: string;
}): Promise<void> {
  await session.run({
    abortSignal,
    command: [
      'if [ -d /home/user/.agents/skills ]; then',
      `  mkdir -p ${JSON.stringify(`${sessionWorkDir}/.agents/skills`)}`,
      `  cp -a /home/user/.agents/skills/. ${JSON.stringify(`${sessionWorkDir}/.agents/skills/`)}`,
      'fi',
    ].join('\n'),
  });
}
