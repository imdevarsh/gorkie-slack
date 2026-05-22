import dotenv from 'dotenv';
import { defineConfig } from 'drizzle-kit';

import { keys } from './src/keys';

dotenv.config({
  path: '../../apps/server/.env',
});

const env = keys();

export default defineConfig({
  schema: './src/schema',
  out: './src/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: env.DATABASE_URL,
  },
});
