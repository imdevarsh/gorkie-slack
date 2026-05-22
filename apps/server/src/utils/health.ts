import { listProviders } from '@/proxy/providers';

export function healthResponse() {
  return {
    status: 'ok' as const,
    message: 'Proxy server is running',
    timestamp: new Date().toISOString(),
    providers: listProviders(),
  };
}
