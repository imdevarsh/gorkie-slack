import { deleteExpiredProxyTokens } from '@repo/db/queries';

export default defineTask({
  meta: {
    name: 'cleanup:proxy-tokens',
    description: 'Delete expired proxy tokens from the database',
  },
  async run() {
    await deleteExpiredProxyTokens();
    return { result: 'ok' };
  },
});
