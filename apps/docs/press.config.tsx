import { createRelativeLink } from 'fumadocs-ui/mdx';
import { defineConfig } from 'fumapress';
import { fumadocsMdx } from 'fumapress/adapters/mdx';
import { createNotebookLayoutPage } from 'fumapress/layouts/notebook';
import { flexsearchPlugin } from 'fumapress/plugins/flexsearch';
import { llmsPlugin } from 'fumapress/plugins/llms.txt';
import { takumiPlugin } from 'fumapress/plugins/takumi';
import { docs } from './.source/server';
import { getMDXComponents } from './src/mdx';

export default defineConfig({
  content: docs.toFumadocsSource(),
  site: {
    baseUrl: process.env.DOCS_BASE_URL ?? 'http://localhost:3000',
    name: 'Gorkie',
  },
})
  .plugins(flexsearchPlugin(), llmsPlugin(), takumiPlugin())
  .layouts({
    page: createNotebookLayoutPage({
      render() {
        return {
          pageProps: {
            full: true,
          },
        };
      },
    }),
    defaultProps() {
      return {
        nav: {
          title: (
            <span className='inline-flex items-center gap-2 font-semibold'>
              <img
                alt=''
                className='size-7 rounded-md object-cover'
                height={28}
                src='/gorkie.png'
                width={28}
              />
              Gorkie
            </span>
          ),
        },
      };
    },
  })
  .adapters(
    fumadocsMdx({
      async getMdxComponents(page) {
        return {
          ...getMDXComponents(),
          a: createRelativeLink(await this.getLoader(), page),
        };
      },
    })
  );
