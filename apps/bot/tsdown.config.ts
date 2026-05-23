import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: './src/index.ts',
  format: 'esm',
  outDir: './dist',
  clean: true,
  onSuccess:
    'mkdir -p dist/extensions && cp src/lib/sandbox/config/extensions/tools.ts dist/extensions/tools.ts',
  deps: {
    alwaysBundle: [/@repo\/.*/],
    onlyBundle: false,
    neverBundle: ['pino', 'pino-pretty', 'thread-stream'],
  },
});
