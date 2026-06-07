import type { z } from 'zod';
import { decryptSecret } from './secret';

export function parseEncrypted<TSchema extends z.ZodType>({
  encrypted,
  schema,
  secret,
}: {
  encrypted: string | null;
  schema: TSchema;
  secret: string;
}): z.output<TSchema> | undefined {
  if (!encrypted) {
    return;
  }
  return schema.parse(
    JSON.parse(
      decryptSecret({
        encrypted,
        secret,
      })
    )
  );
}
