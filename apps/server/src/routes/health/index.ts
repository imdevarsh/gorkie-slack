import { defineHandler } from 'nitro/h3';
import { providers } from '@/config';

export default defineHandler(() => ({
  status: 'ok' as const,
  timestamp: new Date().toISOString(),
  providers: Object.keys(providers).sort(),
}));
