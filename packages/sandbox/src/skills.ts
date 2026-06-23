import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { HarnessV1Skill } from '@ai-sdk/harness';

type SkillFile = NonNullable<HarnessV1Skill['files']>[number];

let cached: Promise<HarnessV1Skill[]> | undefined;

export function loadSkills(): Promise<HarnessV1Skill[]> {
  cached ??= readSkills();
  return cached;
}

async function readSkills(): Promise<HarnessV1Skill[]> {
  const dir = fileURLToPath(new URL('../skills', import.meta.url));
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const skills: HarnessV1Skill[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const skill = await readSkill({
      dir: path.join(dir, entry.name),
      name: entry.name,
    });
    if (skill) {
      skills.push(skill);
    }
  }
  return skills;
}

async function readSkill({
  dir,
  name,
}: {
  dir: string;
  name: string;
}): Promise<HarnessV1Skill | null> {
  const raw = await readFile(path.join(dir, 'SKILL.md'), 'utf8').catch(
    () => null
  );
  const frontmatter = raw
    ? /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw)
    : null;
  if (!(raw && frontmatter?.[1])) {
    return null;
  }

  const description = /^description:[^\S\n]*(.+)$/m
    .exec(frontmatter[1])?.[1]
    ?.trim();
  if (!description) {
    return null;
  }
  const declaredName = /^name:[^\S\n]*(.+)$/m.exec(frontmatter[1])?.[1]?.trim();

  return {
    content: raw.slice(frontmatter[0].length).trimStart(),
    description,
    files: await readSkillFiles(dir),
    name: declaredName || name,
  };
}

async function readSkillFiles(dir: string): Promise<SkillFile[]> {
  const files: SkillFile[] = [];
  const walk = async (current: string): Promise<void> => {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }
      if (entry.name === 'SKILL.md') {
        continue;
      }
      files.push({
        content: await readFile(full, 'utf8'),
        path: path.relative(dir, full).split(path.sep).join('/'),
      });
    }
  };
  await walk(dir);
  return files;
}
