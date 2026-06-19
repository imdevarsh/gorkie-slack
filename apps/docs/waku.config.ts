import tailwindcss from '@tailwindcss/vite';
import mdx from 'fumadocs-mdx/vite';
import press from 'fumapress/vite';
import { defineConfig } from 'waku/config';

export default defineConfig({
  vite: {
    plugins: [press(), mdx(), tailwindcss()],
    server: {
      allowedHosts: [
        '3000--main--gorkie-slack--techwithanirudh.coder.techwithanirudh.com',
      ],
    },
  },
});
