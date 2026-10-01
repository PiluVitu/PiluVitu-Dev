import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Rodape } from './rodape'

describe('Rodape', () => {
  it('mostra o atalho num kbd e o texto do estado, sem "alterar" por padrão', () => {
    render(
      <Rodape
        atalho="⌥⇧P"
        texto="preenche sem abrir o popup"
        onAlterarAtalho={vi.fn()}
      />,
    )
    expect(screen.getByText('⌥⇧P').tagName).toBe('KBD')
    expect(screen.getByText('preenche sem abrir o popup')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'alterar' })).toBeNull()
  })

  it('"alterar" abre a troca de atalho', async () => {
    const abrir = vi.fn()
    render(
      <Rodape
        atalho="Alt+Shift+P"
        texto="preenche sem abrir"
        comAlterar
        onAlterarAtalho={abrir}
      />,
    )
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'alterar' }))
    expect(abrir).toHaveBeenCalledTimes(1)
  })

  it('sem atalho o rodapé inteiro vira o link "definir atalho"', async () => {
    const abrir = vi.fn()
    render(
      <Rodape
        atalho=""
        texto="preenche sem abrir"
        comAlterar
        onAlterarAtalho={abrir}
      />,
    )
    expect(screen.queryByText('preenche sem abrir')).toBeNull()
    expect(screen.queryByRole('button', { name: 'alterar' })).toBeNull()
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'definir atalho' }))
    expect(abrir).toHaveBeenCalledTimes(1)
  })
})
