import { resolveUserName } from '@/lib/slack/names';

// Slack delivers mentions as `<@U123>` or `<@U123|displayName>`; rewrite them to
// `@name (U123)` so the model reads them naturally and still has the id to ping
// back with.
const MENTION = /<@(U[A-Z0-9]+)(?:\|([^>]+))?>/g;

export async function normalizeMentions(text: string): Promise<string> {
  const names = new Map<string, string>();
  const unlabelled = new Set<string>();
  for (const match of text.matchAll(MENTION)) {
    const id = match[1];
    if (!id) {
      continue;
    }
    if (match[2]) {
      names.set(id, match[2]);
    } else {
      unlabelled.add(id);
    }
  }
  if (names.size === 0 && unlabelled.size === 0) {
    return text;
  }

  await Promise.all(
    [...unlabelled].map(async (id) => {
      const name = await resolveUserName(id);
      if (name) {
        names.set(id, name);
      }
    })
  );

  return text.replace(MENTION, (_full, id: string, label?: string) => {
    const name = label ?? names.get(id);
    return name ? `@${name} (${id})` : `@${id}`;
  });
}
