import { render, screen, within } from '@testing-library/react'
import { MAILTO_DA_PRIVACIDADE } from '@/lib/contato'
import { DESCRICAO_DA_PRIVACIDADE, TITULO_DA_PRIVACIDADE } from '@/lib/seo'
import PrivacidadePage, { metadata } from './page'

function secao(titulo: string): HTMLElement {
  const h2 = screen.getByRole('heading', { level: 2, name: titulo })
  return h2.closest('section') as HTMLElement
}

describe('/privacidade', () => {
  it('o h1, a data de vigência e o caminho de volta para a home', () => {
    render(<PrivacidadePage />)
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Política de privacidade',
      }),
    ).toBeInTheDocument()
    const vigencia = screen.getByText('11 de outubro de 2026')
    expect(vigencia.tagName).toBe('TIME')
    expect(vigencia).toHaveAttribute('dateTime', '2026-10-11')
    expect(
      screen.getByRole('link', { name: 'PiluTech, voltar para o início' }),
    ).toHaveAttribute('href', '/')
  })

  it('as seções, nesta ordem', () => {
    render(<PrivacidadePage />)
    expect(
      screen
        .getAllByRole('heading', { level: 2 })
        .map((titulo) => titulo.textContent),
    ).toEqual([
      'Quem é o responsável',
      'Estatísticas de visita',
      'Registros da hospedagem',
      'Quando você fala com a PiluTech',
      'Seus direitos',
      'Mudanças nesta política',
    ])
  })

  it('o responsável é a PiluTech, com o e-mail de assunto [PiluTech] Privacidade', () => {
    render(<PrivacidadePage />)
    const responsavel = secao('Quem é o responsável')
    expect(responsavel).toHaveTextContent('PiluTech')
    const email = within(responsavel).getByRole('link', {
      name: 'pilutechinformatica@gmail.com',
    })
    expect(email).toHaveAttribute('href', MAILTO_DA_PRIVACIDADE)
  })

  // O que cada ferramenta registra vem das políticas da Vercel (conferidas em 2026-10-11):
  // https://vercel.com/docs/analytics/privacy-policy e https://vercel.com/docs/speed-insights/privacy-policy
  it('as estatísticas: o que o Web Analytics e o Speed Insights registram, sem cookie, e a base legal', () => {
    render(<PrivacidadePage />)
    const estatisticas = secao('Estatísticas de visita')
    for (const trecho of [
      'Vercel Web Analytics',
      'a página, a página de onde você veio',
      'o país, a região e a cidade aproximados',
      'o tipo de dispositivo, o sistema e o navegador',
      'não usa cookie',
      'descartado em 24 horas',
      'números somados',
      'Vercel Speed Insights',
      'as Web Vitals',
      'a velocidade da conexão',
      'sem identificar quem visita',
      'LGPD, art. 7º, IX',
      'em nome da PiluTech',
    ])
      expect(estatisticas).toHaveTextContent(trecho)
  })

  it('os registros da hospedagem: a Vercel como operadora, fora do Brasil, com a política dela', () => {
    render(<PrivacidadePage />)
    const hospedagem = secao('Registros da hospedagem')
    for (const trecho of [
      'endereço IP',
      'Vercel Inc.',
      'em nome da PiluTech',
      'fora do Brasil',
      'LGPD, art. 7º, IX',
    ])
      expect(hospedagem).toHaveTextContent(trecho)
    expect(
      within(hospedagem).getByRole('link', {
        name: 'política de privacidade da Vercel',
      }),
    ).toHaveAttribute('href', 'https://vercel.com/legal/privacy-policy')
  })

  it('os direitos da LGPD, com o e-mail e a ANPD', () => {
    render(<PrivacidadePage />)
    const direitos = secao('Seus direitos')
    expect(direitos).toHaveTextContent('art. 18')
    expect(
      within(direitos).getByRole('link', {
        name: 'pilutechinformatica@gmail.com',
      }),
    ).toHaveAttribute('href', MAILTO_DA_PRIVACIDADE)
    expect(
      within(direitos).getByRole('link', {
        name: 'Autoridade Nacional de Proteção de Dados (ANPD)',
      }),
    ).toHaveAttribute('href', 'https://www.gov.br/anpd/pt-br')
  })

  it('todo link externo abre em aba nova, sem passar a referência', () => {
    render(<PrivacidadePage />)
    const externos = screen
      .getAllByRole('link')
      .filter((link) => link.getAttribute('href')?.startsWith('http'))
    expect(externos.length).toBeGreaterThan(0)
    for (const link of externos) {
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    }
  })

  it('metadata: o título, a descrição e o canonical da página', () => {
    expect(metadata.title).toEqual({ absolute: TITULO_DA_PRIVACIDADE })
    expect(metadata.description).toBe(DESCRICAO_DA_PRIVACIDADE)
    expect(metadata.alternates?.canonical).toBe('/privacidade')
  })
})
