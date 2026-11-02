// Client-safe: imports only the client MermaidBlock — NO server-only (remark/rehype)
// imports here, so this module can be imported from client components (the admin preview).
import type { ComponentProps, ReactElement } from 'react'
import { MermaidBlock } from '@/components/mdx/mermaid-block'
import { srcDaImagem } from './src-da-imagem'

/** MDX component overrides shared by the public post page and the admin preview. */
export const mdxComponents = {
  img: ({ src, alt, ...props }: ComponentProps<'img'>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      {...props}
      src={srcDaImagem(typeof src === 'string' ? src : undefined)}
      alt={alt ?? ''}
    />
  ),
  pre: ({
    children,
    ...props
  }: ComponentProps<'pre'> & { 'data-language'?: string }) => {
    const lang = props['data-language']
    if (lang === 'mermaid') {
      const code =
        typeof children === 'object' && children !== null && 'props' in children
          ? String(
              (children as ReactElement<{ children?: string }>).props
                .children ?? '',
            )
          : String(children ?? '')
      return <MermaidBlock chart={code} />
    }
    return <pre {...props}>{children}</pre>
  },
}
