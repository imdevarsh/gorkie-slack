import {
  decryptSecret,
  encryptSecret,
  parseEncrypted as parseEncryptedWith,
} from '@repo/utils';
import type { z } from 'zod';
import { env } from '@/env';

/**
 * Thin wrappers that bake in the MCP encryption key, so callers pass only the
 * value (not `secret: env.MCP_TOKEN_ENCRYPTION_KEY`) every time.
 */
const secret = env.MCP_TOKEN_ENCRYPTION_KEY;

export function encrypt(plaintext: string): string {
  return encryptSecret({ plaintext, secret });
}

export function decrypt(encrypted: string): string {
  return decryptSecret({ encrypted, secret });
}

export function parseEncrypted<TSchema extends z.ZodType>(
  encrypted: string | null,
  schema: TSchema
): z.output<TSchema> | undefined {
  return parseEncryptedWith({ encrypted, schema, secret });
}
