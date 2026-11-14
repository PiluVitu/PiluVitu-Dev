import { renderEstatico } from '@/lib/render-estatico'
import { MdxPreview } from './mdx-preview'

jest.mock('@/hooks/admin/posts/use-mdx-preview', () => ({
  useMdxPreview: () => ({
    serialized: { compiledSource: '', scope: {}, frontmatter: {} },
    error: null,
    loading: false,
  }),
}))
jest.mock('next-mdx-remote', () => ({
  MDXRemote: () => <p>corpo</p>,
}))
jest.mock('@/lib/mdx/mdx-components', () => ({ mdxComponents: {} }))

describe('MdxPreview', () => {
  // Mesma regra do corpo do post: a pré-visualização tem de bater com a página publicada
  // e não pode usar as cores do tema escuro no claro (WEB-01/ADM-03 da auditoria).
  it('só inverte as cores da prosa no tema escuro', () => {
    const raiz = renderEstatico(<MdxPreview mdx="# Título" />)
    const classes = [...(raiz.querySelector('.prose')?.classList ?? [])]
    expect(classes).toContain('dark:prose-invert')
    expect(classes).not.toContain('prose-invert')
  })
})
