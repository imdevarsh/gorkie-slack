import logger from '@/lib/logger';
import { listProviders } from '@/proxy/providers';

export default () => {
  logger.info({ providers: listProviders() }, 'Proxy server started');
};
