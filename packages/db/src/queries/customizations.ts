import { eq } from 'drizzle-orm';
import { db } from '../index';
import { userCustomizations } from '../schema';

export type UserCustomization = Pick<
  typeof userCustomizations.$inferSelect,
  'prompt' | 'allowTraining'
>;

export async function getUserCustomization(
  userId: string
): Promise<UserCustomization | null> {
  const rows = await db
    .select({
      prompt: userCustomizations.prompt,
      allowTraining: userCustomizations.allowTraining,
    })
    .from(userCustomizations)
    .where(eq(userCustomizations.userId, userId))
    .limit(1);

  return rows[0] ?? null;
}

export async function setUserCustomization(
  userId: string,
  customization: Partial<UserCustomization>
): Promise<void> {
  await db
    .insert(userCustomizations)
    .values({
      userId,
      prompt: customization.prompt ?? '',
      allowTraining: customization.allowTraining ?? true,
    })
    .onConflictDoUpdate({
      target: userCustomizations.userId,
      set: {
        ...(customization.prompt === undefined
          ? {}
          : { prompt: customization.prompt }),
        ...(customization.allowTraining === undefined
          ? {}
          : { allowTraining: customization.allowTraining }),
        updatedAt: new Date(),
      },
    });
}

export async function setUserDataTraining(
  userId: string,
  allow: boolean
): Promise<void> {
  await db
    .insert(userCustomizations)
    .values({ userId, prompt: '', allowTraining: allow })
    .onConflictDoUpdate({
      target: userCustomizations.userId,
      set: { allowTraining: allow, updatedAt: new Date() },
    });
}

export async function clearUserCustomization(userId: string): Promise<void> {
  await db
    .delete(userCustomizations)
    .where(eq(userCustomizations.userId, userId));
}
