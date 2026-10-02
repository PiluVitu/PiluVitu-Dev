import { render, screen, within } from '@testing-library/react'
import TermosPage from './page'

describe('/termos', () => {
  beforeEach(() => {
    render(<TermosPage />)
  })

  it('o título e a data de vigência', () => {
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Termos de uso do Botaí',
    )
    const data = screen.getByText('2 de outubro de 2026')
    expect(data.tagName).toBe('TIME')
    expect(data).toHaveAttribute('dateTime', '2026-10-02')
  })

  it('as seções, na ordem', () => {
    expect(
      screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent),
    ).toEqual([
      'Aceitação',
      'O que é o Botaí',
      'A licença do código',
      'Para que serve',
      'O que é proibido',
      'Dados que podem ser de alguém',
      'A caixa de e-mail pública',
      'Sem garantia',
      'Limite de responsabilidade',
      'Marcas de terceiros',
      'Privacidade',
      'Mudanças',
      'Lei e foro',
      'Contato',
    ])
  })

  // Review Focus 5: os termos não podem tirar o que a MIT dá sobre o código.
  it('a MIT, com o link para o LICENSE, vale sobre o código', () => {
    expect(screen.getByRole('link', { name: 'licença MIT' })).toHaveAttribute(
      'href',
      'https://github.com/PiluVitu/PiluVitu-Dev/blob/main/apps/botai/LICENSE',
    )
    expect(document.body).toHaveTextContent(
      'Se algum trecho destes termos parecer limitar o que a MIT permite fazer com o código, vale a MIT.',
    )
  })

  it('as proibições pedidas pelo dono', () => {
    const itens = within(screen.getByRole('list', { name: 'Proibições' }))
      .getAllByRole('listitem')
      .map((li) => li.textContent)
      .join('\n')
    expect(itens).toMatch(/falsidade ideológica/)
    expect(itens).toMatch(/cadastro, conta, compra/)
    expect(itens).toMatch(/verificação de identidade/)
    expect(itens).toMatch(/SMS/)
  })

  it('foro de Teresina/PI, com a ressalva do CDC', () => {
    expect(document.body).toHaveTextContent('comarca de Teresina/PI')
    expect(document.body).toHaveTextContent(
      'propor a ação no foro do próprio domicílio (CDC, art. 101, I)',
    )
  })

  it('as marcas de terceiros, com os titulares', () => {
    for (const titular of [
      'Google LLC',
      'Mozilla Foundation',
      'Microsoft Corporation',
      'Opera Norway AS',
      'Stripe, Inc.',
    ])
      expect(document.body).toHaveTextContent(titular)
  })

  it('privacidade, contato e histórico', () => {
    for (const link of screen.getAllByRole('link', {
      name: 'política de privacidade',
    }))
      expect(link).toHaveAttribute('href', '/privacidade')
    expect(
      screen.getByRole('link', { name: 'pilutechinformatica@gmail.com' }),
    ).toHaveAttribute('href', 'mailto:pilutechinformatica@gmail.com')
    expect(
      screen.getByRole('link', { name: 'histórico do código-fonte do site' }),
    ).toHaveAttribute(
      'href',
      'https://github.com/PiluVitu/PiluVitu-Dev/commits/main/apps/botai-site/app/termos/page.tsx',
    )
  })

  // O Botaí ainda está "Em breve": o texto vale antes e depois das lojas.
  it('não diz que já está nas lojas', () => {
    expect(document.body).not.toHaveTextContent(
      /dispon[ií]vel|publicad[oa] nas lojas/i,
    )
  })
})
