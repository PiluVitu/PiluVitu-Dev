import { render, screen, within } from '@testing-library/react'
import { WHATSAPP } from '@/lib/contato'
import { SECOES_DA_BARRA } from '@/lib/conteudo'
import { Barra } from './barra'

describe('Barra', () => {
  it('é a navegação principal, escura e fixa no topo', () => {
    render(<Barra />)
    expect(screen.getByRole('navigation', { name: 'Principal' })).toHaveClass(
      'dark',
      'sticky',
      'top-0',
    )
  })

  it('o símbolo com o nome leva ao início', () => {
    render(<Barra />)
    expect(screen.getByRole('link', { name: 'PiluTech' })).toHaveAttribute(
      'href',
      '#inicio',
    )
  })

  it('os links das 5 seções, na ordem do design', () => {
    render(<Barra />)
    expect(
      within(screen.getByRole('list'))
        .getAllByRole('link')
        .map((a) => [a.textContent, a.getAttribute('href')]),
    ).toEqual(SECOES_DA_BARRA.map((s) => [s.rotulo, `#${s.id}`]))
  })

  // Spec: somem abaixo de 900 px por CSS, não por JavaScript (o E2E confere com o JavaScript desligado).
  it('os links das seções somem abaixo de 900 px por CSS', () => {
    render(<Barra />)
    expect(screen.getByRole('list')).toHaveClass('hidden', 'min-[900px]:flex')
  })

  it('o WhatsApp abre a conversa geral em aba nova', () => {
    render(<Barra />)
    const link = screen.getByRole('link', { name: 'WhatsApp' })
    expect(link).toHaveAttribute('href', WHATSAPP.geral)
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  // Review Focus 7: no escuro, o anel padrão do Button é o Ciano do próprio botão.
  it('o botão do WhatsApp tem anel de foco de 2 px com folga do fundo', () => {
    render(<Barra />)
    expect(screen.getByRole('link', { name: 'WhatsApp' })).toHaveClass(
      'focus-visible:ring-2',
      'focus-visible:ring-offset-2',
      'focus-visible:ring-offset-background',
    )
  })
})
