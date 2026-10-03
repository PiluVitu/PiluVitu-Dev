import { render, screen, within } from '@testing-library/react'
import { MAILTO_DO_SITE, WHATSAPP } from '@/lib/contato'
import { Contato } from './contato'

describe('Contato', () => {
  it('seção escura, rotulada pelo título, com a âncora #contato', () => {
    render(<Contato />)
    const secao = screen.getByRole('region', {
      name: 'Conte o que você precisa.',
    })
    expect(secao).toHaveAttribute('id', 'contato')
    expect(secao).toHaveClass('dark')
    expect(within(secao).getByText('contato')).toBeInTheDocument()
    expect(
      within(secao).getByText(
        'A conversa é direta com quem vai desenvolver. Pelo WhatsApp ou por e-mail.',
      ),
    ).toBeInTheDocument()
  })

  it('o WhatsApp com o telefone, na conversa geral, em aba nova', () => {
    render(<Contato />)
    const link = screen.getByRole('link', {
      name: 'WhatsApp (86) 98173-7625',
    })
    expect(link).toHaveAttribute('href', WHATSAPP.geral)
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('o e-mail vai com [PiluTech] Contato pelo site no assunto', () => {
    render(<Contato />)
    const link = screen.getByRole('link', {
      name: 'E-mail pilutechinformatica@gmail.com',
    })
    expect(link).toHaveAttribute('href', MAILTO_DO_SITE)
    expect(link).not.toHaveAttribute('target')
  })

  // Review Focus 1: o endereço não tem espaço; a 320 px ele tem de quebrar dentro do botão.
  it('o botão do e-mail quebra o endereço em vez de vazar', () => {
    render(<Contato />)
    expect(
      screen.getByRole('link', {
        name: 'E-mail pilutechinformatica@gmail.com',
      }),
    ).toHaveClass('wrap-anywhere', 'whitespace-normal', 'max-w-full', 'h-auto')
  })

  // Review Focus 7: no escuro, o anel padrão do Button é o Ciano do próprio botão.
  it('os dois botões têm anel de foco de 2 px com folga do fundo', () => {
    render(<Contato />)
    for (const nome of [
      'WhatsApp (86) 98173-7625',
      'E-mail pilutechinformatica@gmail.com',
    ])
      expect(screen.getByRole('link', { name: nome })).toHaveClass(
        'focus-visible:ring-2',
        'focus-visible:ring-offset-2',
        'focus-visible:ring-offset-background',
      )
  })
})
