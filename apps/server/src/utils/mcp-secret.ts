import { decryptSecret } from '@repo/utils';
import type { z } from 'zod';
import { env } from '@/env';

export function parseEncryptedMcpJson<TSchema extends z.ZodType>({
  encrypted,
  schema,
}: {
  encrypted: string | null;
  schema: TSchema;
}): z.output<TSchema> | undefined {
  if (!encrypted) {
    return;
  }
  return schema.parse(
    JSON.parse(
      decryptSecret({
        encrypted,
        secret: env.MCP_TOKEN_ENCRYPTION_KEY,
      })
    )
  );
}
