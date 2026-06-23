import { defineConfig } from 'fumadocs-preview/config';

export default defineConfig({
  content: {
    projects: [
      {
        dir: './docs',
        include: ['.'],
        name: 'gorkie-slack',
      },
    ],
  },
});
