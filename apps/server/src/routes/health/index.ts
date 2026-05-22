import { defineHandler } from 'nitro/h3';
export default defineHandler(() => ({
  status: 'ok' as const,
  timestamp: new Date().toISOString(),
}));
