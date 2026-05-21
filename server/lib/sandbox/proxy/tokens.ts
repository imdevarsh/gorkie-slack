import { randomBytes } from 'node:crypto';
import { and, eq, gt } from 'drizzle-orm';
import { sandbox as config } from '~/config';
import { db } from '~/db';
import { proxyTokens } from '~/db/schema';

export async function issueToken({
  sandboxId,
}: {
  sandboxId: string;
}): Promise<string> {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + config.timeoutMs);
  await db.insert(proxyTokens).values({ token, sandboxId, expiresAt });
  return token;
}

export async function validateToken(
  token: string
): Promise<{ sandboxId: string } | null> {
  const rows = await db
    .select({ sandboxId: proxyTokens.sandboxId })
    .from(proxyTokens)
    .where(
      and(eq(proxyTokens.token, token), gt(proxyTokens.expiresAt, new Date()))
    )
    .limit(1);

  return rows[0] ?? null;
}

export async function revokeToken({
  sandboxId,
}: {
  sandboxId: string;
}): Promise<void> {
  await db.delete(proxyTokens).where(eq(proxyTokens.sandboxId, sandboxId));
}
