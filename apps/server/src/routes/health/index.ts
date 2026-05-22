import { defineHandler } from 'nitro';
import { listProviders } from '@/proxy/providers';

export default defineHandler(() => ({
  ok: true,
  providers: listProviders(),
}));
