import { eq } from 'drizzle-orm';
import { db } from '../client';
import { type UserCustomization, userCustomizations } from '../schema';

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
  await db
    .insert(userCustomizations)
    .values({ userId, prompt: customization.prompt })
    .onConflictDoUpdate({
      target: userCustomizations.userId,
      set: { prompt: customization.prompt, updatedAt: new Date() },
    });
}

export async function clearUserCustomization(userId: string): Promise<void> {
  await db
    .delete(userCustomizations)
    .where(eq(userCustomizations.userId, userId));
}
