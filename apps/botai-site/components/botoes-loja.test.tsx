import { render, screen, within } from '@testing-library/react'
import { BotoesLoja } from './botoes-loja'

const FIREFOX = 'https://addons.mozilla.org/pt-BR/firefox/addon/botai/'
const LOJAS = [
  { loja: 'chrome', url: null },
  { loja: 'firefox', url: FIREFOX },
  { loja: 'edge', url: null },
  { loja: 'opera', url: null },
] as const

describe('BotoesLoja', () => {
  it('uma lista "Instalar pela loja" com as 4 lojas, na ordem recebida', () => {
    render(<BotoesLoja lojas={[...LOJAS]} />)
    const lista = screen.getByRole('list', { name: 'Instalar pela loja' })
    expect(
      within(lista)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual([
      'Chrome Web Store Em breve',
      'Firefox Add-ons',
      'Microsoft Edge Add-ons Em breve',
      'Opera add-ons Em breve',
    ])
  })

  it('loja publicada: link para a loja, em aba nova', () => {
    render(<BotoesLoja lojas={[...LOJAS]} />)
    const link = screen.getByRole('link', { name: 'Firefox Add-ons' })
    expect(link).toHaveAttribute('href', FIREFOX)
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  // O href="#" do protótipo não vai para produção.
  it('loja sem URL: botão "Em breve" desabilitado, sem link', () => {
    const { container } = render(<BotoesLoja lojas={[...LOJAS]} />)
    expect(
      screen.getByRole('button', { name: 'Chrome Web Store Em breve' }),
    ).toBeDisabled()
    expect(container.querySelectorAll('a')).toHaveLength(1)
    expect(container.querySelector('a[href="#"]')).toBeNull()
  })

  it('variante outline, para o bloco de instalar', () => {
    render(<BotoesLoja lojas={[...LOJAS]} variante="outline" />)
    expect(screen.getByRole('link', { name: 'Firefox Add-ons' })).toHaveClass(
      'border-input',
    )
  })

  // A 320 px, "Microsoft Edge Add-ons Em breve" numa linha só (278 px) passa da lista (272 px) e
  // invade o gutter; o scrollWidth da página não acusa. O botão quebra o texto em vez de vazar.
  it('o botão quebra linha em vez de passar da largura da lista', () => {
    render(<BotoesLoja lojas={[...LOJAS]} />)
    for (const botao of [
      screen.getByRole('button', { name: 'Microsoft Edge Add-ons Em breve' }),
      screen.getByRole('link', { name: 'Firefox Add-ons' }),
    ]) {
      expect(botao).toHaveClass('whitespace-normal', 'max-w-full', 'min-h-10')
      expect(botao).not.toHaveClass('whitespace-nowrap')
    }
  })
})
