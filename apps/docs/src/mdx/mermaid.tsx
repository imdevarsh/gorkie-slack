import { renderMermaidSVG } from 'beautiful-mermaid';
import { CodeBlock, Pre } from 'fumadocs-ui/components/codeblock';

export function Mermaid({ chart }: { chart: string }) {
  try {
    return (
      <div
        className='my-6 overflow-x-auto rounded-lg border bg-fd-card p-4'
        // biome-ignore lint/security/noDangerouslySetInnerHtml: rendered by beautiful-mermaid
        dangerouslySetInnerHTML={{
          __html: renderMermaidSVG(chart, {
            bg: 'var(--color-fd-card)',
            fg: 'var(--color-fd-card-foreground)',
            interactive: true,
            transparent: true,
          }),
        }}
      />
    );
  } catch {
    return (
      <CodeBlock title='Mermaid'>
        <Pre>{chart}</Pre>
      </CodeBlock>
    );
  }
}
