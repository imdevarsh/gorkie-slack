import tailwindcss from '@tailwindcss/vite';
import mdx from 'fumadocs-mdx/vite';
import press from 'fumapress/vite';
import { defineConfig } from 'waku/config';

export default defineConfig({
  vite: {
    plugins: [press(), mdx(), tailwindcss()],
    resolve: {
      dedupe: ['react', 'react-dom'],
    },
    server: {
      allowedHosts: [
        '.coder.techwithanirudh.com',
      ],
    },
  },
});
