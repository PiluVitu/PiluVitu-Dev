import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PaginaProibida, type PaginaProibidaProps } from './pagina-proibida'

function props(extra: Partial<PaginaProibidaProps> = {}): PaginaProibidaProps {
  return {
    motivo: 'proibida',
    navegador: 'chrome',
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

  it.each([
    [
      'edge',
      'O Edge não deixa extensões mexerem nesta página',
      'Vale para páginas edge://, a loja de complementos do Edge e o leitor de PDF, e para qualquer extensão. Abra o formulário numa aba comum e tente de novo.',
    ],
    [
      'opera',
      'O Opera não deixa extensões mexerem nesta página',
      'Vale para páginas opera://, a loja de extensões do Opera e o leitor de PDF, e para qualquer extensão. Abra o formulário numa aba comum e tente de novo.',
    ],
    [
      'firefox',
      'O Firefox não deixa extensões mexerem nesta página',
      'Vale para páginas about:, os sites da Mozilla (como addons.mozilla.org) e o leitor de PDF, e para qualquer extensão. Abra o formulário numa aba comum e tente de novo.',
    ],
  ] as const)(
    'no %s, o 1e fala do próprio navegador',
    (navegador, titulo, corpo) => {
      render(<PaginaProibida {...props({ navegador })} />)
      expect(
        screen.getByRole('heading', { level: 1, name: titulo }),
      ).toBeInTheDocument()
      expect(screen.getByText(/e o leitor de PDF/)).toHaveTextContent(corpo)
    },
  )

  it.each([
    [
      'edge',
      "Em edge://extensions, nos detalhes da extensão, ative 'Permitir acesso a URLs de arquivo' e tente de novo.",
    ],
    [
      'opera',
      "Em opera://extensions, nos detalhes da extensão, ative 'Permitir acesso a URLs de arquivo' e tente de novo.",
    ],
    [
      'firefox',
      "Em about:addons, nos detalhes da extensão, ative 'Acessar arquivos locais no seu computador' e tente de novo.",
    ],
  ] as const)(
    'no %s, o file: sem acesso ensina o caminho do próprio navegador',
    (navegador, corpo) => {
      render(
        <PaginaProibida
          {...props({ navegador, motivo: 'arquivo-sem-acesso' })}
        />,
      )
      expect(screen.getByText(/nos detalhes da extensão/)).toHaveTextContent(
        corpo,
      )
    },
  )
})
