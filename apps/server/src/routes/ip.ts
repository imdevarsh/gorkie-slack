import { defineHandler, getRequestIP } from 'nitro/h3';

export default defineHandler((event) => ({
  ip: getRequestIP(event, { xForwardedFor: true }) ?? null,
}));
