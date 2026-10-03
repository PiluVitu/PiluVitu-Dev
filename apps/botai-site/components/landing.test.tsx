import { render, screen, within } from '@testing-library/react'
import { modeloDaLanding } from '@/lib/modelo'
import { Landing } from './landing'

const SEM_LOJA = { chromeUrl: '', firefoxUrl: '', edgeUrl: '', operaUrl: '' }
const FIREFOX = 'https://addons.mozilla.org/pt-BR/firefox/addon/botai/'

function renderizar(urls = SEM_LOJA) {
  return render(<Landing {...modeloDaLanding(urls)} />)
}

describe('Landing', () => {
  // Um h1 com o nome e a proposta; o nome grande do design não é título.
  it('um único h1, com o nome e a proposta', () => {
    renderizar()
    const [h1, ...outros] = screen.getAllByRole('heading', { level: 1 })
    expect(outros).toEqual([])
    expect(h1).toHaveTextContent(
      'Botaí: Gerador de dados fake para formulários (CPF, CNPJ, CEP)',
    )
  })

  it('as seções na ordem do design', () => {
    renderizar()
    expect(
      screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent),
    ).toEqual([
      'Por que existe',
      'O que ele bota',
      'Capturas',
      'Como usar',
      'Privacidade',
      'Cuidados',
      'Bota aí no seu navegador',
    ])
  })

  it('as âncoras do topo levam a seções que existem', () => {
    renderizar()
    for (const alvo of ['como-usar', 'capturas'])
      expect(document.getElementById(alvo)).not.toBeNull()
  })

  it('em breve: selo, nota e as 4 lojas desabilitadas nos dois blocos', () => {
    renderizar()
    // "Em breve" aparece no selo e dentro de cada botão de loja sem URL.
    expect(
      screen.getAllByText('Em breve').filter((el) => !el.closest('button')),
    ).toHaveLength(1)
    expect(
      screen.getByText(
        'Chegando às lojas do Chrome, do Firefox, do Edge e do Opera',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getAllByRole('list', { name: 'Instalar pela loja' }),
    ).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: /Em breve$/ })).toHaveLength(8)
    expect(screen.queryByText(/dispon[ií]vel/i)).toBeNull()
  })

  it('com o Firefox publicado: link nos dois blocos, o resto em breve', () => {
    renderizar({ ...SEM_LOJA, firefoxUrl: FIREFOX })
    const links = screen.getAllByRole('link', { name: 'Firefox Add-ons' })
    expect(links.map((a) => a.getAttribute('href'))).toEqual([FIREFOX, FIREFOX])
    expect(screen.getByText('Disponível')).toBeInTheDocument()
    expect(
      screen.getByText('Firefox · grátis e de código aberto'),
    ).toBeInTheDocument()
  })

  it('cinco recursos e três passos, cada um com o seu h3', () => {
    renderizar()
    const recursos = screen.getByRole('region', { name: 'O que ele bota' })
    expect(within(recursos).getAllByRole('heading', { level: 3 })).toHaveLength(
      5,
    )
    const uso = screen.getByRole('region', { name: 'Como usar' })
    expect(
      within(uso)
        .getAllByRole('heading', { level: 3 })
        .map((h) => h.textContent),
    ).toEqual(['A página inteira', 'Um campo só', 'Ver e copiar os dados'])
  })

  it('a política fica em /privacidade, e o rodapé leva à PiluTech', () => {
    renderizar()
    expect(
      screen.getByRole('link', { name: 'Política de privacidade' }),
    ).toHaveAttribute('href', '/privacidade')
    expect(
      screen.getByRole('link', { name: 'Powered by PiluTech' }),
    ).toHaveAttribute('href', 'https://pilutech.com.br')
    expect(screen.getByRole('link', { name: 'PiluLabs' })).toHaveAttribute(
      'href',
      'https://piluvitu.com.br/pilulabs',
    )
  })

  it('os cuidados levam aos termos de uso', () => {
    renderizar()
    const cuidados = within(screen.getByRole('region', { name: 'Cuidados' }))
    expect(
      cuidados.getByRole('link', { name: 'Termos de uso' }),
    ).toHaveAttribute('href', '/termos')
  })
})
