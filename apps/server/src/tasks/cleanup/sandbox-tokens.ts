import { deleteExpiredSandboxTokens } from '@repo/db/queries';
import { defineTask } from 'nitro/task';
import logger from '@/utils/logger';

export default defineTask({
  meta: {
    name: 'cleanup:sandbox-tokens',
    description: 'Delete expired sandbox tokens from the database',
  },
  async run() {
    try {
      const count = await deleteExpiredSandboxTokens();
      logger.info({ count }, '[cleanup] expired sandbox tokens deleted');
    } catch (error) {
      logger.error({ err: error }, '[cleanup] failed to delete sandbox tokens');
      throw error;
    }
    return { result: 'ok' };
  },
});
