import { defineConfig } from 'fumapress';
import { fumadocsMdx } from 'fumapress/adapters/mdx';
import { flexsearchPlugin } from 'fumapress/plugins/flexsearch';
import { llmsPlugin } from 'fumapress/plugins/llms.txt';
import { takumiPlugin } from 'fumapress/plugins/takumi';
import { docs } from './.source/server';

export default defineConfig({
  content: docs.toFumadocsSource(),
  site: {
    name: 'Gorkie Docs',
  },
})
  .plugins(flexsearchPlugin(), llmsPlugin(), takumiPlugin())
  .adapters(fumadocsMdx());
