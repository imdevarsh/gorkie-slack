import { defineHandler } from 'nitro';
import { getRequestIp } from '@/utils/request';

export default defineHandler((event) => ({
  ip: getRequestIp(event.req),
}));
