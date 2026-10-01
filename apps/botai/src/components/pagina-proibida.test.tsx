import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PaginaProibida, type PaginaProibidaProps } from './pagina-proibida'

function props(extra: Partial<PaginaProibidaProps> = {}): PaginaProibidaProps {
  return {
    motivo: 'proibida',
    nome: 'Maria Eduarda Souza',
    onVerDados: vi.fn(),
    onGerarPessoa: vi.fn(),
    ...extra,
  }
}

describe('PaginaProibida (1e)', () => {
  it('explica a recusa do Chrome e deixa o Preencher desabilitado', () => {
    render(<PaginaProibida {...props()} />)
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'O Chrome não deixa extensões mexerem nesta página',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/a Chrome Web Store e o leitor de PDF/),
    ).toHaveTextContent(
      'Vale para páginas chrome://, a Chrome Web Store e o leitor de PDF, e para qualquer extensão. Abra o formulário numa aba comum e tente de novo.',
    )
    expect(
      screen.getByRole('button', { name: 'Preencher esta página' }),
    ).toBeDisabled()
  })

  it('em file: sem acesso, ensina a liberar o acesso a arquivos', () => {
    render(<PaginaProibida {...props({ motivo: 'arquivo-sem-acesso' })} />)
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Falta liberar o acesso a arquivos',
      }),
    ).toBeInTheDocument()
    expect(screen.getByText(/nos detalhes da extensão/)).toHaveTextContent(
      "Em chrome://extensions, nos detalhes da extensão, ative 'Permitir acesso a URLs de arquivo' e tente de novo.",
    )
    expect(
      screen.getByRole('button', { name: 'Preencher esta página' }),
    ).toBeDisabled()
  })

  it('com pessoa, o cartão leva aos dados para copiar', async () => {
    const dados = vi.fn()
    render(<PaginaProibida {...props({ onVerDados: dados })} />)
    expect(screen.getByText('Maria Eduarda Souza')).toBeInTheDocument()
    expect(
      screen.getByText('Os dados continuam aqui para copiar.'),
    ).toBeInTheDocument()
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Ver os dados' }))
    expect(dados).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: 'Gerar pessoa' })).toBeNull()
  })

  it('sem pessoa, o cartão vira "Gerar pessoa"', async () => {
    const gerar = vi.fn()
    render(<PaginaProibida {...props({ nome: null, onGerarPessoa: gerar })} />)
    expect(
      screen.getByText('Gere uma pessoa para copiar os dados à mão.'),
    ).toBeInTheDocument()
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Gerar pessoa' }))
    expect(gerar).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: 'Ver os dados' })).toBeNull()
  })

  it('o Preencher desabilitado não mostra o atalho', () => {
    render(<PaginaProibida {...props()} />)
    expect(
      screen
        .getByRole('button', { name: 'Preencher esta página' })
        .querySelector('kbd'),
    ).toBeNull()
  })
})
