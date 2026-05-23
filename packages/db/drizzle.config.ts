import { resolve } from 'node:path';
import dotenv from 'dotenv';
import { defineConfig } from 'drizzle-kit';

import { keys } from './src/keys';

const root = resolve(process.cwd(), '../..');
dotenv.config({ path: resolve(root, 'apps/server/.env') });
dotenv.config({ path: resolve(root, 'apps/bot/.env') });

const env = keys();

export default defineConfig({
  schema: './src/schema',
  out: './src/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: env.DATABASE_URL,
  },
});
