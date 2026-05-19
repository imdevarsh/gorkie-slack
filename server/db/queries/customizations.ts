import { eq } from 'drizzle-orm';
import { db } from '~/db';
import { userCustomizations } from '~/db/schema';

export interface UserCustomization {
  prompt?: string;
}

export async function getUserCustomization(
  userId: string
): Promise<UserCustomization | null> {
  const rows = await db
    .select({ prompt: userCustomizations.prompt })
    .from(userCustomizations)
    .where(eq(userCustomizations.userId, userId))
    .limit(1);

  return rows[0] ?? null;
}

export async function setUserCustomization(
  userId: string,
  customization: UserCustomization
): Promise<void> {
  const prompt = customization.prompt ?? '';
  await db
    .insert(userCustomizations)
    .values({ userId, prompt })
    .onConflictDoUpdate({
      target: userCustomizations.userId,
      set: { prompt, updatedAt: new Date() },
    });
}

export async function clearUserCustomization(userId: string): Promise<void> {
  await db
    .delete(userCustomizations)
    .where(eq(userCustomizations.userId, userId));
}
