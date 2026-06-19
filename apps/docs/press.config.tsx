import { createRelativeLink } from 'fumadocs-ui/mdx';
import { defineConfig } from 'fumapress';
import { fumadocsMdx } from 'fumapress/adapters/mdx';
import { createDocsLayoutPage } from 'fumapress/layouts/docs';
import { flexsearchPlugin } from 'fumapress/plugins/flexsearch';
import { llmsPlugin } from 'fumapress/plugins/llms.txt';
import { docs } from './.source/server';
import { getMDXComponents } from './src/mdx';

const DocsLayoutPage = createDocsLayoutPage();

export default defineConfig({
  content: docs.toFumadocsSource(),
  site: {
    baseUrl: process.env.DOCS_BASE_URL ?? 'http://localhost:3000',
    name: 'Gorkie',
  },
  meta: {
    root() {
      return (
        <>
          <link href='/gorkie.png' rel='icon' type='image/png' />
          <link href='/gorkie.png' rel='apple-touch-icon' />
        </>
      );
    },
  },
})
  .plugins(flexsearchPlugin(), llmsPlugin())
  .layouts({
    page(props) {
      // fumapress always renders `<title>{page.data.title}</title>`. We render
      // our own "<page> | Gorkie" title first so React hoists it to <head>
      // ahead of the default; browsers honor the first <title> in tree order.
      return (
        <>
          <title>{`${props.page.data.title} | Gorkie`}</title>
          <DocsLayoutPage {...props} />
        </>
      );
    },
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
        sidebar: {
          collapsible: false,
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
