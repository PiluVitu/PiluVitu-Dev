import type { ComponentProps, ReactElement } from 'react'
import { MermaidBlock } from '@/components/mdx/mermaid-block'

/** MDX component overrides shared by the public post page and the admin preview. */
export const mdxComponents = {
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
