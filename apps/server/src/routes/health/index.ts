import { defineHandler } from 'nitro/h3';
import { listProviders } from '@/proxy/providers';

export default defineHandler(() => ({
  status: 'ok' as const,
  message: 'Proxy server is running',
  timestamp: new Date().toISOString(),
  providers: listProviders(),
}));
