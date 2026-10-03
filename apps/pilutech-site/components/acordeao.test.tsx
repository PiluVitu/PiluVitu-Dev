import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderToStaticMarkup } from 'react-dom/server'
import { DUVIDAS } from '@/lib/conteudo'
import { Acordeao } from './acordeao'

const perguntas = () => screen.getAllByRole('button')
const estados = () => perguntas().map((b) => b.getAttribute('aria-expanded'))

describe('Acordeao', () => {
  it('cada pergunta é um botão num h3, ligado à resposta por aria-controls', () => {
    render(<Acordeao itens={DUVIDAS} />)
    DUVIDAS.forEach((duvida, indice) => {
      const botao = screen.getByRole('button', { name: duvida.pergunta })
      expect(botao.parentElement?.tagName).toBe('H3')
      expect(botao).toHaveAttribute('id', `duvida-${indice + 1}-pergunta`)
      const resposta = document.getElementById(
        botao.getAttribute('aria-controls') ?? '',
      )
      expect(resposta).toHaveAttribute('id', `duvida-${indice + 1}-resposta`)
      expect(resposta).toHaveTextContent(duvida.resposta)
    })
  })

  it('a primeira vem aberta e as outras fechadas, com hidden', () => {
    render(<Acordeao itens={DUVIDAS} />)
    expect(estados()).toEqual(['true', 'false', 'false', 'false', 'false'])
    expect(screen.getByText(DUVIDAS[0].resposta)).toBeVisible()
    for (const duvida of DUVIDAS.slice(1))
      expect(screen.getByText(duvida.resposta)).not.toBeVisible()
  })

  it('abrir uma fecha a outra, e clicar de novo fecha', async () => {
    const user = userEvent.setup()
    render(<Acordeao itens={DUVIDAS} />)
    const terceira = screen.getByRole('button', { name: DUVIDAS[2].pergunta })
    await user.click(terceira)
    expect(estados()).toEqual(['false', 'false', 'true', 'false', 'false'])
    expect(screen.getByText(DUVIDAS[2].resposta)).toBeVisible()
    await user.click(terceira)
    expect(estados()).toEqual(['false', 'false', 'false', 'false', 'false'])
  })

  it('pelo teclado: Tab chega na pergunta, Enter e Espaço abrem e fecham', async () => {
    const user = userEvent.setup()
    render(<Acordeao itens={DUVIDAS} />)
    await user.tab()
    expect(perguntas()[0]).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(perguntas()[0]).toHaveAttribute('aria-expanded', 'false')
    await user.tab()
    expect(perguntas()[1]).toHaveFocus()
    await user.keyboard(' ')
    expect(perguntas()[1]).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText(DUVIDAS[1].resposta)).toBeVisible()
  })

  it('o sinal é − na aberta e + nas fechadas, fora do leitor de tela', () => {
    const { container } = render(<Acordeao itens={DUVIDAS} />)
    expect(
      [...container.querySelectorAll('button [aria-hidden="true"]')].map(
        (sinal) => sinal.textContent,
      ),
    ).toEqual(['−', '+', '+', '+', '+'])
  })

  // Review Focus 4: o Google não clica no acordeão, e sem JavaScript as respostas têm de estar no HTML.
  it('no HTML do servidor: as 5 respostas, a primeira aberta e 4 com hidden', () => {
    const html = renderToStaticMarkup(<Acordeao itens={DUVIDAS} />)
    for (const duvida of DUVIDAS) expect(html).toContain(duvida.resposta)
    expect(html.match(/ hidden=""/g)).toHaveLength(4)
    expect(html.match(/aria-expanded="true"/g)).toHaveLength(1)
  })
})
