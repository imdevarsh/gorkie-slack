import { decryptSecret, encryptSecret } from '@repo/utils';
import type { z } from 'zod';
import { env } from '@/env';

const secret = env.MCP_ENCRYPTION_KEY;

export function encrypt(plaintext: string): string {
  return encryptSecret({ plaintext, secret });
}

export function decrypt(encrypted: string): string {
  return decryptSecret({ encrypted, secret });
}

export function parseEncrypted<TSchema extends z.ZodType>({
  encrypted,
  schema,
}: {
  encrypted: string | null;
  schema: TSchema;
}): z.output<TSchema> | undefined {
  if (!encrypted) {
    return;
  }
  return schema.parse(JSON.parse(decryptSecret({ encrypted, secret })));
}
