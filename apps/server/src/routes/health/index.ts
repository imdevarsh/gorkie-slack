import { defineHandler } from 'nitro/h3';
export default defineHandler(() => ({
  status: 'ok',
  timestamp: new Date().toISOString(),
}));
