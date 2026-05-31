import { eq } from 'drizzle-orm';
import { db } from '../index';
import { userCustomizations } from '../schema';

export type UserCustomization = Pick<
  typeof userCustomizations.$inferSelect,
  'prompt' | 'allowDataTraining'
>;

export async function getUserCustomization(
  userId: string
): Promise<UserCustomization | null> {
  const rows = await db
    .select({
      prompt: userCustomizations.prompt,
      allowDataTraining: userCustomizations.allowDataTraining,
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
      allowDataTraining: customization.allowDataTraining ?? true,
    })
    .onConflictDoUpdate({
      target: userCustomizations.userId,
      set: {
        ...(customization.prompt === undefined
          ? {}
          : { prompt: customization.prompt }),
        ...(customization.allowDataTraining === undefined
          ? {}
          : { allowDataTraining: customization.allowDataTraining }),
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
    .values({ userId, prompt: '', allowDataTraining: allow })
    .onConflictDoUpdate({
      target: userCustomizations.userId,
      set: { allowDataTraining: allow, updatedAt: new Date() },
    });
}

export async function clearUserCustomization(userId: string): Promise<void> {
  await db
    .delete(userCustomizations)
    .where(eq(userCustomizations.userId, userId));
}
