import { render, screen, within } from '@testing-library/react'
import {
  APURAI,
  BIBLIA,
  BOTAI,
  cartoesDosProjetos,
  REPARAI,
  SOMBRAI,
  VEJAI,
} from '@/lib/conteudo'
import { CartaoDoProjeto, Projetos } from './projetos'

function cartao(href: string): HTMLElement {
  const link = document.querySelector(`a[href="${href}"]`)
  if (!(link instanceof HTMLElement)) throw new Error(`sem cartão para ${href}`)
  return link
}

function cartaoPeloNome(nome: string): HTMLElement {
  const item = screen
    .getByRole('heading', { level: 3, name: nome })
    .closest('li')
  if (!(item instanceof HTMLElement)) throw new Error(`sem cartão para ${nome}`)
  return item
}

describe('Projetos', () => {
  it('seção clara, rotulada pelo título, com a âncora #projetos', () => {
    render(<Projetos faseDoBotai="em-breve" />)
    const secao = screen.getByRole('region', {
      name: 'Produtos próprios da PiluTech.',
    })
    expect(secao).toHaveAttribute('id', 'projetos')
    expect(secao).not.toHaveClass('dark')
  })

  it('os seis produtos, na ordem, e a contagem do cabeçalho', () => {
    render(<Projetos faseDoBotai="em-breve" />)
    expect(
      screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent),
    ).toEqual([
      'Botaí',
      'Sombraí',
      'Apuraí',
      'Reparaí',
      'Vejaí',
      'Bíblia offline',
    ])
    expect(screen.getByText('06')).toBeInTheDocument()
  })

  it('Botaí, Sombraí e Apuraí levam ao domínio deles em aba nova', () => {
    render(<Projetos faseDoBotai="em-breve" />)
    for (const projeto of [BOTAI, SOMBRAI, APURAI]) {
      const link = cartao(projeto.url)
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', 'noopener noreferrer')
      expect(within(link).getByText(projeto.texto)).toBeInTheDocument()
      expect(link).toHaveTextContent(`${projeto.endereco} →`)
    }
    expect(screen.getAllByRole('link')).toHaveLength(3)
  })

  it('cartão sem link não é clicável: sem <a>, sem seta e sem endereço', () => {
    render(<Projetos faseDoBotai="em-breve" />)
    for (const projeto of [REPARAI, VEJAI, BIBLIA]) {
      const item = cartaoPeloNome(projeto.nome)
      expect(item.querySelector('a')).toBeNull()
      expect(within(item).getByText(projeto.texto)).toBeInTheDocument()
      expect(item).not.toHaveTextContent('→')
      expect(item).not.toHaveTextContent('pilutech.com.br')
    }
  })

  it('a imagem OG de cada domínio passa pelo otimizador do Next, com o alt do design', () => {
    render(<Projetos faseDoBotai="em-breve" />)
    for (const projeto of [BOTAI, SOMBRAI]) {
      const imagem = screen.getByRole('img', { name: projeto.imagem.alt })
      expect(imagem.getAttribute('src')).toContain(
        `url=${encodeURIComponent(projeto.imagem.src)}&`,
      )
    }
    expect(screen.getAllByRole('img')).toHaveLength(2)
  })

  it('os cartões sem imagem não têm img', () => {
    render(<Projetos faseDoBotai="em-breve" />)
    for (const projeto of [APURAI, REPARAI, VEJAI, BIBLIA])
      expect(cartaoPeloNome(projeto.nome).querySelector('img')).toBeNull()
  })

  it('sem loja publicada, o Botaí diz em breve, e o Apuraí, disponível', () => {
    render(<Projetos faseDoBotai="em-breve" />)
    expect(
      within(cartao(BOTAI.url)).getByText('Extensão de navegador · em breve'),
    ).toBeInTheDocument()
    expect(
      within(cartao(SOMBRAI.url)).getByText('App Android e iPhone · em breve'),
    ).toBeInTheDocument()
    expect(
      within(cartao(APURAI.url)).getByText('Site · disponível'),
    ).toBeInTheDocument()
    expect(
      within(cartaoPeloNome(REPARAI.nome)).getByText('Painel web · em breve'),
    ).toBeInTheDocument()
    expect(
      within(cartaoPeloNome(VEJAI.nome)).getByText(
        'Extensão de navegador · em breve',
      ),
    ).toBeInTheDocument()
    expect(
      within(cartaoPeloNome(BIBLIA.nome)).getByText(
        'App de celular · em breve',
      ),
    ).toBeInTheDocument()
  })

  it('com o Botaí publicado no CMS, só o selo dele muda', () => {
    render(<Projetos faseDoBotai="disponivel" />)
    expect(
      within(cartao(BOTAI.url)).getByText('Extensão de navegador · disponível'),
    ).toBeInTheDocument()
    expect(
      within(cartao(SOMBRAI.url)).getByText('App Android e iPhone · em breve'),
    ).toBeInTheDocument()
    expect(
      within(cartaoPeloNome(VEJAI.nome)).getByText(
        'Extensão de navegador · em breve',
      ),
    ).toBeInTheDocument()
  })
})

describe('CartaoDoProjeto', () => {
  it('com URL é um link em aba nova, com o endereço e a seta', () => {
    const [, , apurai] = cartoesDosProjetos('em-breve')
    render(<CartaoDoProjeto projeto={apurai} />)
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', 'https://apurai.pilutech.com.br/')
    expect(link).toHaveClass('hover:border-primary')
    expect(link).toHaveTextContent('apurai.pilutech.com.br →')
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('sem URL é uma caixa sem hover, sem link e sem seta', () => {
    const [, , , reparai] = cartoesDosProjetos('em-breve')
    const { container } = render(<CartaoDoProjeto projeto={reparai} />)
    expect(screen.queryByRole('link')).toBeNull()
    const caixa = container.firstElementChild
    expect(caixa?.tagName).toBe('DIV')
    expect(caixa).not.toHaveClass('hover:border-primary')
    expect(caixa).toHaveTextContent('Painel web · em breve')
    expect(caixa).not.toHaveTextContent('→')
  })
})
