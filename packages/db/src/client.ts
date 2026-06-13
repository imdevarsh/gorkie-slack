import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { env } from './env';
import * as schema from './schema';

const client = postgres(env.DATABASE_URL, {
  prepare: false,
  ssl: env.DATABASE_URL.includes('supabase.co') ? 'require' : false,
});

export const db = drizzle({
  client,
  schema,
  casing: 'snake_case',
});
