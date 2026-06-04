import remarkGfm from 'remark-gfm'
import rehypeSlug from 'rehype-slug'
import rehypeAutolinkHeadings from 'rehype-autolink-headings'
import rehypePrettyCode from 'rehype-pretty-code'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const MDX_REMARK_PLUGINS: any[] = [remarkGfm]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const MDX_REHYPE_PLUGINS: any[] = [
  rehypeSlug,
  [rehypeAutolinkHeadings, { behavior: 'wrap' }],
  [
    rehypePrettyCode,
    {
      theme: { dark: 'github-dark', light: 'github-light' },
      keepBackground: false,
    },
  ],
]
