import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { Ajuda } from './ajuda'

const CONTEUDO = 'Mês de referência da despesa, não a data do pagamento.'

describe('Ajuda', () => {
  test('não renderiza o conteúdo no DOM antes de abrir', () => {
    render(<Ajuda rotulo="Competência">{CONTEUDO}</Ajuda>)

    expect(screen.queryByText(CONTEUDO)).not.toBeInTheDocument()
  })

  test('o gatilho é um button com aria-label derivado de rotulo (não é um "?" mudo)', () => {
    render(<Ajuda rotulo="Competência">{CONTEUDO}</Ajuda>)

    const gatilho = screen.getByRole('button', { name: /competência/i })
    expect(gatilho).toHaveAttribute('type', 'button')
  })

  test('abre o conteúdo ao clicar no gatilho', async () => {
    const user = userEvent.setup()
    render(<Ajuda rotulo="Competência">{CONTEUDO}</Ajuda>)

    await user.click(screen.getByRole('button', { name: /competência/i }))

    expect(await screen.findByText(CONTEUDO)).toBeInTheDocument()
  })

  test('hover no gatilho, sem clique, não abre o conteúdo', async () => {
    const user = userEvent.setup()
    render(<Ajuda rotulo="Competência">{CONTEUDO}</Ajuda>)

    await user.hover(screen.getByRole('button', { name: /competência/i }))

    expect(screen.queryByText(CONTEUDO)).not.toBeInTheDocument()
  })

  test('fecha com Esc depois de aberto por clique', async () => {
    const user = userEvent.setup()
    render(<Ajuda rotulo="Competência">{CONTEUDO}</Ajuda>)

    await user.click(screen.getByRole('button', { name: /competência/i }))
    expect(await screen.findByText(CONTEUDO)).toBeInTheDocument()

    await user.keyboard('{Escape}')

    expect(screen.queryByText(CONTEUDO)).not.toBeInTheDocument()
  })
})

describe('Ajuda — área de toque', () => {
  test('o gatilho tem 44×44 de área clicável sem crescer o círculo de 20px', () => {
    // ⚠️ MEDIDO em Chrome real a 390×844 (o Android do dono, usado muitas
    // vezes sob sol): o gatilho tem 20×20 px em 10 telas — menos da metade
    // do lado recomendado (44, Apple HIG / WCAG 2.5.5).
    //
    // A correção NÃO cresce o círculo: ele mora colado a títulos e rótulos,
    // e viraria o elemento mais pesado da linha. Quem cresce é um
    // pseudo-elemento absoluto centrado — `position: absolute` não ocupa
    // espaço no fluxo, então nenhum layout muda.
    render(<Ajuda rotulo="Competência">{CONTEUDO}</Ajuda>)
    const gatilho = screen.getByRole('button', { name: /competência/i })

    // o círculo continua 20×20 (h-5 w-5)
    expect(gatilho.className).toMatch(/\bh-5\b/)
    expect(gatilho.className).toMatch(/\bw-5\b/)
    // e a área de toque é 44×44 (h-11 w-11), centrada sobre ele
    expect(gatilho.className).toContain('after:h-11')
    expect(gatilho.className).toContain('after:w-11')
    expect(gatilho.className).toContain('after:absolute')
    // `relative` é o que ancora o pseudo-elemento no gatilho; sem ele a área
    // se posicionaria contra um ancestral qualquer, longe do "?".
    expect(gatilho.className).toMatch(/\brelative\b/)
  })
})
