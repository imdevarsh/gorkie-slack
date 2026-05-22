import { fileURLToPath } from 'node:url';
import { defineConfig } from 'nitro';

export default defineConfig({
  preset: process.env.VERCEL ? 'vercel' : 'bun',
  serverDir: 'src',
  alias: {
    '@': fileURLToPath(new URL('./src', import.meta.url)),
  },
});
