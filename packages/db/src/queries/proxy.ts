import { randomBytes } from 'node:crypto';
import { and, eq, gt, lt } from 'drizzle-orm';
import { db } from '../index';
import { proxyTokens } from '../schema';

const DEFAULT_TTL_MS = 10 * 60 * 1000;

export async function issueProxyToken({
  sandboxId,
  ttlMs = DEFAULT_TTL_MS,
}: {
  sandboxId: string;
  ttlMs?: number;
}): Promise<{ expiresAt: Date; token: string }> {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + ttlMs);

  await db.insert(proxyTokens).values({ token, sandboxId, expiresAt });

  return { expiresAt, token };
}

export async function validateProxyToken(
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

export async function revokeProxyToken({
  sandboxId,
}: {
  sandboxId: string;
}): Promise<void> {
  await db.delete(proxyTokens).where(eq(proxyTokens.sandboxId, sandboxId));
}

export async function deleteExpiredProxyTokens(
  now = new Date()
): Promise<void> {
  await db.delete(proxyTokens).where(lt(proxyTokens.expiresAt, now));
}
