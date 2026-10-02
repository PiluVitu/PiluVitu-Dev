import { render, screen } from '@testing-library/react'
import PrivacidadePage from './page'

describe('/privacidade', () => {
  beforeEach(() => {
    render(<PrivacidadePage />)
  })

  it('o título, a data e o resumo', () => {
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Política de privacidade do Botaí',
    )
    const data = screen.getByText('1 de outubro de 2026')
    expect(data.tagName).toBe('TIME')
    expect(data).toHaveAttribute('dateTime', '2026-10-01')
  })

  it('as seções da política, na ordem', () => {
    expect(
      screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent),
    ).toEqual([
      'Quem é o responsável',
      'O que o Botaí acessa, e quando',
      'O que fica guardado',
      'O que é enviado',
      'Sites que ele abre, só quando você clica',
      'Dados fictícios e pessoas reais',
      'Permissões',
      'Como apagar os dados',
      'Mudanças nesta política',
    ])
  })

  it('as 5 permissões; menus só no Firefox', () => {
    const linhas = screen.getAllByRole('row').slice(1)
    expect(
      linhas.map((linha) => linha.querySelector('th')?.textContent),
    ).toEqual(['activeTab', 'scripting', 'contextMenus', 'storage', 'menus'])
    expect(linhas[4]).toHaveTextContent('Só no Firefox')
  })

  it('contato por e-mail e o histórico no arquivo novo', () => {
    expect(
      screen.getByRole('link', { name: 'pilutechinformatica@gmail.com' }),
    ).toHaveAttribute('href', 'mailto:pilutechinformatica@gmail.com')
    expect(
      screen.getByRole('link', { name: 'histórico do código-fonte do site' }),
    ).toHaveAttribute(
      'href',
      'https://github.com/PiluVitu/PiluVitu-Dev/commits/main/apps/botai-site/app/privacidade/page.tsx',
    )
  })

  it('o voltar leva à landing', () => {
    expect(screen.getByRole('link', { name: 'Botaí' })).toHaveAttribute(
      'href',
      '/',
    )
  })
})
