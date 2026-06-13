import { fileURLToPath } from 'node:url';
import { defineConfig } from 'nitro';

export default defineConfig({
  serverDir: 'src',
  alias: {
    '@': fileURLToPath(new URL('./src', import.meta.url)),
  },
  routeRules: {
    '/': { redirect: '/health' },
  },
  renderer: { handler: './src/renderer' },
  serverAssets: [{ baseName: 'templates', dir: './src/templates' }],
});
