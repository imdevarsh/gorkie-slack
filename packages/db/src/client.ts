import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { env } from './env';
import * as schema from './schema';

let connectionString = env.DATABASE_URL;
if (connectionString.includes('postgres:postgres@supabase_db_')) {
  const url = new URL(connectionString);
  url.hostname = url.hostname.split('_')[1] ?? url.hostname;
  connectionString = url.href;
}

const client = postgres(connectionString, {
  prepare: false,
  ssl: connectionString.includes('supabase.co') ? 'require' : false,
});

export const db = drizzle({
  client,
  schema,
  casing: 'snake_case',
});
