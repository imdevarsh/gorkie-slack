import { PostgresSessionPersistDriver } from '@sandbox-agent/persist-postgres';
import { env } from '~/env';

export const sessionPersist = new PostgresSessionPersistDriver({
  connectionString: env.DATABASE_URL,
  schema: 'public',
});
