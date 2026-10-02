import { renderEstatico } from '@/lib/render-estatico'
import { ProdutoCard, type ItemDoCard } from './produto-card'

const BOTAI: ItemDoCard = {
  slug: 'botai',
  nome: 'Botaí',
  subtitulo: 'Gerador de dados fake para formulários (CPF, CNPJ, CEP)',
  descricao: 'Extensão que preenche o formulário da página com um atalho.',
  logo: '/pilulabs/botai/icone-128.png',
  sigla: 'BO',
  tags: ['Extensão', 'QA'],
  tipo: 'extensao',
}

const SOMBRAI: ItemDoCard = {
  slug: 'sombrai',
  nome: 'Sombraí',
  subtitulo: 'Plante sombra em Teresina',
  descricao: 'App que mostra quais árvores nativas cabem no seu quintal.',
  logo: '/pilulabs/sombrai/icone.png',
  sigla: 'SO',
  tags: ['Swift'],
  tipo: 'mobile',
}

describe('ProdutoCard', () => {
  it('extensão: link interno na mesma aba, com nome, subtítulo, descrição, tags e fase', () => {
    const raiz = renderEstatico(
      <ProdutoCard
        item={BOTAI}
        href="/pilulabs/botai"
        fase="em-breve"
        lojas={[]}
      />,
    )
    const link = raiz.querySelector('a')
    expect(link?.getAttribute('href')).toBe('/pilulabs/botai')
    expect(link?.hasAttribute('target')).toBe(false)
    expect(raiz.querySelector('h3')?.textContent).toBe('Botaí')
    expect(raiz.textContent).toContain(BOTAI.subtitulo)
    expect(raiz.textContent).toContain(BOTAI.descricao)
    expect(
      [...raiz.querySelectorAll('ul:not([aria-label]) li')].map(
        (li) => li.textContent,
      ),
    ).toEqual(['Extensão', 'QA'])
    expect(raiz.textContent).toContain('Em breve')
  })

  // Na mesma linha do nome, o selo espremia o subtítulo numa coluna de uma ou
  // duas palavras (6 linhas no card de 1/3 da largura, a 1280 px).
  it('o selo da fase fica fora da linha do nome, que usa a largura do card', () => {
    const raiz = renderEstatico(
      <ProdutoCard
        item={BOTAI}
        href="/pilulabs/botai"
        fase="em-breve"
        lojas={[]}
      />,
    )
    const cartao = raiz.querySelector('a')!
    const selo = [...cartao.querySelectorAll('span')].find(
      (el) => el.textContent === 'Em breve',
    )!
    const ancestraisDoNome: Element[] = []
    for (
      let el = raiz.querySelector('h3')!.parentElement;
      el && el !== cartao;
      el = el.parentElement
    )
      ancestraisDoNome.push(el)
    expect(selo).toBeDefined()
    expect(ancestraisDoNome.filter((el) => el.contains(selo))).toEqual([])
  })

  it('link externo abre em aba nova', () => {
    const link = renderEstatico(
      <ProdutoCard
        item={SOMBRAI}
        href="https://sombrai.pilutech.com.br"
        fase="em-breve"
        lojas={[]}
      />,
    ).querySelector('a')
    expect(link?.getAttribute('href')).toBe('https://sombrai.pilutech.com.br')
    expect(link?.getAttribute('target')).toBe('_blank')
    expect(link?.getAttribute('rel')).toBe('noopener noreferrer')
  })

  // Item sem site, página nem repo: o card existe, mas sem botão morto.
  it('sem link, vira um article sem <a>', () => {
    const raiz = renderEstatico(
      <ProdutoCard item={SOMBRAI} href={null} fase="em-breve" lojas={[]} />,
    )
    expect(raiz.querySelector('a')).toBeNull()
    expect(raiz.querySelector('article h3')?.textContent).toBe('Sombraí')
  })

  // As lojas modeladas são de navegador: fase e ícones só fazem sentido em extensão.
  it('status e lojas só em extensão', () => {
    const app = renderEstatico(
      <ProdutoCard
        item={SOMBRAI}
        href={null}
        fase="disponivel"
        lojas={['chrome']}
      />,
    )
    expect(app.textContent).not.toContain('Disponível')
    expect(app.querySelector('[aria-label="Lojas"]')).toBeNull()
  })

  it('extensão sem loja publicada, sem a lista de lojas', () => {
    const raiz = renderEstatico(
      <ProdutoCard item={BOTAI} href={null} fase="em-breve" lojas={[]} />,
    )
    expect(raiz.querySelector('[aria-label="Lojas"]')).toBeNull()
  })

  it('extensão: lista só as lojas recebidas, pelo nome', () => {
    const raiz = renderEstatico(
      <ProdutoCard
        item={BOTAI}
        href="/pilulabs/botai"
        fase="disponivel"
        lojas={['chrome', 'opera']}
      />,
    )
    expect(
      [...raiz.querySelectorAll('[aria-label="Lojas"] li')].map(
        (li) => li.textContent,
      ),
    ).toEqual(['Chrome Web Store', 'Opera add-ons'])
  })

  // O next/image recusa host fora do remotePatterns; o logo por URL vai cru.
  it('logo por URL sai sem o otimizador; o de public/ passa por ele', () => {
    const remoto = renderEstatico(
      <ProdutoCard
        item={{ ...SOMBRAI, logo: 'https://cdn.example.com/sombrai.png' }}
        href={null}
        fase="em-breve"
        lojas={[]}
      />,
    ).querySelector('img')
    expect(remoto?.getAttribute('src')).toBe(
      'https://cdn.example.com/sombrai.png',
    )
    const local = renderEstatico(
      <ProdutoCard item={BOTAI} href={null} fase="em-breve" lojas={[]} />,
    ).querySelector('img')
    expect(local?.getAttribute('src')).toMatch(/^\/_next\/image\?url=/)
  })

  it('sem logo, a sigla no lugar', () => {
    const raiz = renderEstatico(
      <ProdutoCard
        item={{ ...SOMBRAI, logo: '' }}
        href={null}
        fase="em-breve"
        lojas={[]}
      />,
    )
    expect(raiz.querySelector('img')).toBeNull()
    expect(raiz.querySelector('[data-sigla]')?.textContent).toBe('SO')
  })
})
