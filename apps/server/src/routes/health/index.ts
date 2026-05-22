import { defineHandler } from 'nitro/h3';
import { healthResponse } from '@/utils/health';

export default defineHandler(() => healthResponse());
