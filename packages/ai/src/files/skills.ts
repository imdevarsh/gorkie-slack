import path from 'node:path';
import type { HarnessV1Skill } from '@ai-sdk/harness';
import type { Experimental_SandboxSession } from '@ai-sdk/provider-utils';

export async function loadTemplateSkills({
  abortSignal,
  session,
}: {
  abortSignal?: AbortSignal;
  session: Experimental_SandboxSession;
}): Promise<HarnessV1Skill[]> {
  const result = await session.run({
    abortSignal,
    command:
      'find /home/user/.agents/skills -mindepth 2 -maxdepth 2 -type f -name SKILL.md -print 2>/dev/null | sort',
  });

  if (result.exitCode !== 0) {
    return [];
  }

  const skills: HarnessV1Skill[] = [];
  for (const skillPath of result.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)) {
    const content = await session.readTextFile({
      abortSignal,
      path: skillPath,
    });
    if (!content) {
      continue;
    }

    const skill = parseSkill({ content, path: skillPath });
    if (!skill) {
      continue;
    }

    skills.push({
      ...skill,
      files: await loadSkillFiles({ abortSignal, session, skillPath }),
    });
  }

  return skills;
}

async function loadSkillFiles({
  abortSignal,
  session,
  skillPath,
}: {
  abortSignal?: AbortSignal;
  session: Experimental_SandboxSession;
  skillPath: string;
}): Promise<NonNullable<HarnessV1Skill['files']>> {
  const result = await session.run({
    abortSignal,
    command: `find ${JSON.stringify(path.posix.dirname(skillPath))} -type f ! -name SKILL.md -print 2>/dev/null | sort`,
  });

  if (result.exitCode !== 0) {
    return [];
  }

  const files: NonNullable<HarnessV1Skill['files']>[number][] = [];
  for (const filePath of result.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)) {
    const relativePath = path.posix.relative(
      path.posix.dirname(skillPath),
      filePath
    );
    if (
      relativePath.length === 0 ||
      relativePath.startsWith('../') ||
      path.posix.isAbsolute(relativePath)
    ) {
      continue;
    }

    const content = await session.readTextFile({
      abortSignal,
      path: filePath,
    });
    if (content === null) {
      continue;
    }

    files.push({ content, path: relativePath });
  }

  return files;
}

function parseSkill({
  content,
  path: skillPath,
}: {
  content: string;
  path: string;
}): Omit<HarnessV1Skill, 'files'> | undefined {
  if (!content.startsWith('---\n')) {
    return;
  }

  const end = content.indexOf('\n---', 4);
  if (end < 0) {
    return;
  }

  let name: string | undefined;
  let description: string | undefined;
  for (const line of content.slice(4, end).split('\n')) {
    const separator = line.indexOf(':');
    if (separator < 0) {
      continue;
    }

    const key = line.slice(0, separator).trim();
    const value = line
      .slice(separator + 1)
      .trim()
      .replace(/^['"]|['"]$/g, '');
    if (key === 'name') {
      name = value;
    }
    if (key === 'description') {
      description = value;
    }
  }

  if (!description) {
    return;
  }

  return {
    content: content.slice(end + 4).trimStart(),
    description,
    name: name || path.posix.basename(path.posix.dirname(skillPath)),
  };
}
