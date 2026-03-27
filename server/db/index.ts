import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { env } from '~/env';
/* biome-ignore lint/performance/noNamespaceImport: Drizzle schema namespace import is intentional. */
import * as schema from './schema';

const pool = new Pool({ connectionString: env.DATABASE_URL });

export const db = drizzle({
  client: pool,
  schema,
  casing: 'snake_case',
});
