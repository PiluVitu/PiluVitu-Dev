import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CreditoPiluTech } from './credito-pilutech'

const NOME = 'Powered by PiluTech (abre pilutech.com.br)'

describe('CreditoPiluTech', () => {
  it('mostra "Powered by PiluTech" com o ícone de link externo, e o nome acessível diz para onde leva', () => {
    render(<CreditoPiluTech onAbrir={vi.fn()} />)
    const botao = screen.getByRole('button', { name: NOME })
    expect(botao).toHaveTextContent(/^Powered by PiluTech$/)
    expect(
      botao.querySelector('svg[data-icon="arrow-up-right-from-square"]'),
    ).not.toBeNull()
  })

  it('o clique chama onAbrir', async () => {
    const onAbrir = vi.fn()
    render(<CreditoPiluTech onAbrir={onAbrir} />)
    await userEvent.setup().click(screen.getByRole('button', { name: NOME }))
    expect(onAbrir).toHaveBeenCalledOnce()
  })

  // O popup já tem um <footer> (o rodapé do atalho) e os testes do App usam
  // a ausência de contentinfo para dizer "estado sem rodapé" (1e).
  it('não é um landmark de rodapé', () => {
    render(<CreditoPiluTech onAbrir={vi.fn()} />)
    expect(screen.queryByRole('contentinfo')).toBeNull()
  })
})
