import { defineHandler } from 'nitro/h3';
import { getRequestIp } from '@/utils/request';

export default defineHandler((event) => ({ ip: getRequestIp(event.req) }));
