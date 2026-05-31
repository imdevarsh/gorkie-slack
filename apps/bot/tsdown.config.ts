import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: './src/index.ts',
  format: 'esm',
  outDir: './dist',
  clean: true,
  copy: 'src/lib/sandbox',
  deps: {
    alwaysBundle: [/@repo\/.*/],
    onlyBundle: false,
    neverBundle: ['pino', 'pino-pretty', 'thread-stream'],
  },
});
