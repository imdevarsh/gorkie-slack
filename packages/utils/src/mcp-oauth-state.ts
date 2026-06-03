import { createHmac, timingSafeEqual } from 'node:crypto';
import { mcpOAuthStatePayloadSchema } from '@repo/validators';

interface McpOAuthStatePayload {
  nonce: string;
  serverId: string;
  userId: string;
}

export function createMcpOAuthState({
  nonce,
  secret,
  serverId,
  userId,
}: McpOAuthStatePayload & { secret: string }): string {
  const payload = Buffer.from(
    JSON.stringify({ nonce, serverId, userId }),
    'utf8'
  ).toString('base64url');
  const signature = createHmac('sha256', secret)
    .update(payload)
    .digest('base64url');
  return `${payload}.${signature}`;
}

export function parseMcpOAuthState({
  secret,
  state,
}: {
  secret: string;
  state: string;
}): McpOAuthStatePayload | null {
  const [payload, signature] = state.split('.');
  if (!(payload && signature)) {
    return null;
  }

  const expected = createHmac('sha256', secret)
    .update(payload)
    .digest('base64url');
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    actualBuffer.byteLength !== expectedBuffer.byteLength ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const result = mcpOAuthStatePayloadSchema.safeParse(
      JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    );
    if (result.success) {
      return result.data;
    }
  } catch {
    return null;
  }

  return null;
}
