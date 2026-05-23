import { deleteExpiredProxyTokens } from '@repo/db/queries';
import { defineTask } from 'nitro/task';
import logger from '@/utils/logger';

export default defineTask({
  meta: {
    name: 'cleanup:proxy-tokens',
    description: 'Delete expired proxy tokens from the database',
  },
  async run() {
    try {
      const count = await deleteExpiredProxyTokens();
      logger.info({ count }, '[cleanup] expired proxy tokens deleted');
    } catch (error) {
      logger.error({ err: error }, '[cleanup] failed to delete proxy tokens');
      throw error;
    }
    return { result: 'ok' };
  },
});
