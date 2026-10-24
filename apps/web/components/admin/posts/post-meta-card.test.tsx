import type { ComponentProps } from 'react'
import { renderEstatico } from '@/lib/render-estatico'
import type { PostFrontmatter } from '@/lib/admin/post-schema'
import type { ResumoButton } from './resumo-button'
import { PostMetaCard } from './post-meta-card'

const mockBotao: { props: ComponentProps<typeof ResumoButton> | null } = {
  props: null,
}
jest.mock('./resumo-button', () => ({
  ResumoButton: (props: ComponentProps<typeof ResumoButton>) => {
    mockBotao.props = props
    return <button type="button">Gerar resumo</button>
  },
}))

const fm: PostFrontmatter = {
  title: 'Como usar o Husky',
  slug: 'husky',
  excerpt: 'Resumo.',
  coverImage: '',
  tags: ['devops'],
  publishedAt: '',
  draft: false,
  readingTimeMinutes: 3,
  tldr: 'Um TL;DR.',
  metaDescription: 'Uma meta.',
}

function card(
  onChange = jest.fn(),
  value: PostFrontmatter = fm,
  errors?: Record<string, string>,
) {
  const raiz = renderEstatico(
    <PostMetaCard
      value={value}
      body="# Husky"
      onChange={onChange}
      slugEditable={false}
      errors={errors}
    />,
  )
  return { raiz, onChange }
}

describe('PostMetaCard', () => {
  it('mostra o botão de resumo e os campos TL;DR e Meta description', () => {
    const { raiz } = card()
    expect(raiz.textContent).toContain('Gerar resumo')
    expect(raiz.textContent).toContain('TL;DR')
    expect(raiz.textContent).toContain('Meta description')
    const textos = [...raiz.querySelectorAll('textarea')].map((t) => t.value)
    expect(textos).toEqual(expect.arrayContaining(['Um TL;DR.', 'Uma meta.']))
  })

  it('passa título, corpo e tags ao botão', () => {
    card()
    expect(mockBotao.props?.title).toBe('Como usar o Husky')
    expect(mockBotao.props?.body).toBe('# Husky')
    expect(mockBotao.props?.tags).toEqual(['devops'])
  })

  it('aplicar o resumo preenche tldr, metaDescription e tags no formulário', () => {
    const { onChange } = card()
    mockBotao.props?.onAplicar({
      tldr: 'Novo TL;DR.',
      metaDescription: 'Nova meta.',
      tags: ['git'],
    })
    expect(onChange).toHaveBeenCalledWith({
      ...fm,
      tldr: 'Novo TL;DR.',
      metaDescription: 'Nova meta.',
      tags: ['git'],
    })
  })

  it('conta os caracteres da meta e mostra o erro do schema', () => {
    const { raiz } = card(jest.fn(), fm, {
      metaDescription: 'Máximo de 160 caracteres',
    })
    expect(raiz.textContent).toContain('9/160')
    expect(raiz.textContent).toContain('Máximo de 160 caracteres')
  })
})
