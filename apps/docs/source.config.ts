import {
  rehypeCodeDefaultOptions,
  remarkMdxMermaid,
} from 'fumadocs-core/mdx-plugins';
import { defineConfig, defineDocs } from 'fumadocs-mdx/config';
import { metaSchema, pageSchema } from 'fumapress/adapters/mdx/schema';

export const docs = defineDocs({
  dir: 'content',
  docs: {
    async: true,
    schema: pageSchema,
    postprocess: {
      includeProcessedMarkdown: true,
    },
  },
  meta: {
    schema: metaSchema,
  },
});

export default defineConfig({
  mdxOptions: {
    rehypeCodeOptions: {
      langs: ['bash', 'json', 'md', 'mdx', 'sh', 'ts', 'tsx'],
      themes: {
        dark: 'github-dark',
        light: 'github-light',
      },
      transformers: rehypeCodeDefaultOptions.transformers,
    },
    remarkPlugins: [remarkMdxMermaid],
  },
});
