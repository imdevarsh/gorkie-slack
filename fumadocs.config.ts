import { defineConfig } from 'fumadocs-preview/config';

export default defineConfig({
  content: {
    projects: [
      {
        name: 'gorkie-slack',
        dir: './',
        include: ['docs'],
      },
    ],
  },
});
