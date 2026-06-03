import { defineConfig } from 'taze';

export default defineConfig({
  depFields: {
    overrides: false,
  },
  force: true,
  ignoreOtherWorkspaces: true,
  ignorePaths: ['**/node_modules/**'],
  includeLocked: true,
  install: true,
  interactive: true,
  maturityPeriod: 3,
  packageMode: {
    '@types/node': 'minor',
    '/react/': 'minor',
    eslint: 'minor',
    typescript: 'major',
  },
  recursive: true,
  write: true,
});
