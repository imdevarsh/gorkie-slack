import { eq } from 'drizzle-orm';
import { db } from '~/db';
import { userPrompts } from '~/db/schema';

export async function getUserPrompt(userId: string): Promise<string | null> {
  const row = await db
    .select({ prompt: userPrompts.prompt })
    .from(userPrompts)
    .where(eq(userPrompts.userId, userId))
    .limit(1)
    .then((rows) => rows[0] ?? null);

  return row?.prompt ?? null;
}

export async function setUserPrompt(
  userId: string,
  prompt: string
): Promise<void> {
  await db
    .insert(userPrompts)
    .values({ userId, prompt })
    .onConflictDoUpdate({
      target: userPrompts.userId,
      set: { prompt, updatedAt: new Date() },
    });
}

export async function clearUserPrompt(userId: string): Promise<void> {
  await db.delete(userPrompts).where(eq(userPrompts.userId, userId));
}
