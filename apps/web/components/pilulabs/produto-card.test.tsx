import { renderEstatico } from '@/lib/render-estatico'
import { ProdutoCard } from './produto-card'

const BOTAI = {
  slug: 'botai',
  nome: 'Botaí',
  resumo: 'Gerador de dados fake para formulários (CPF, CNPJ, CEP)',
  icone: '/pilulabs/botai/icone-128.png',
  tags: ['Extensão', 'QA'],
}

describe('ProdutoCard', () => {
  it('é um link para a página do produto, com nome, resumo, tags e fase', () => {
    const raiz = renderEstatico(
      <ProdutoCard produto={BOTAI} fase="em-breve" lojas={[]} />,
    )
    expect(raiz.querySelector('a')?.getAttribute('href')).toBe(
      '/pilulabs/botai',
    )
    expect(raiz.querySelector('h3')?.textContent).toBe('Botaí')
    expect(raiz.textContent).toContain(BOTAI.resumo)
    expect(
      [...raiz.querySelectorAll('ul:not([aria-label]) li')].map(
        (li) => li.textContent,
      ),
    ).toEqual(['Extensão', 'QA'])
    expect(raiz.textContent).toContain('Em breve')
  })

  it('sem loja publicada, sem a lista de lojas', () => {
    const raiz = renderEstatico(
      <ProdutoCard produto={BOTAI} fase="em-breve" lojas={[]} />,
    )
    expect(raiz.querySelector('[aria-label="Lojas"]')).toBeNull()
  })

  it('lista só as lojas recebidas, pelo nome', () => {
    const raiz = renderEstatico(
      <ProdutoCard
        produto={BOTAI}
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

  it('sem ícone, sem img', () => {
    const raiz = renderEstatico(
      <ProdutoCard
        produto={{ ...BOTAI, icone: '' }}
        fase="em-breve"
        lojas={[]}
      />,
    )
    expect(raiz.querySelector('img')).toBeNull()
  })
})
