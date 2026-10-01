import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { NenhumCampo } from './nenhum-campo'

const CORPO_COM_CAMPOS =
  'mas nenhum com name, id, label ou autocomplete que eu conheça. Formulários dentro de iframe de outro domínio também ficam de fora.'

describe('NenhumCampo (1d)', () => {
  it('conta os campos achados e explica por que nenhum foi reconhecido', () => {
    render(<NenhumCampo y={3} onTentarDeNovo={vi.fn()} onVerDados={vi.fn()} />)
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Nenhum campo reconhecido nesta página',
      }),
    ).toBeInTheDocument()
    expect(screen.getByText(/mas nenhum com/)).toHaveTextContent(
      `Encontrei 3 campos, ${CORPO_COM_CAMPOS}`,
    )
  })

  it('com um campo só, fala no singular', () => {
    render(<NenhumCampo y={1} onTentarDeNovo={vi.fn()} onVerDados={vi.fn()} />)
    expect(screen.getByText(/mas nenhum com/)).toHaveTextContent(
      `Encontrei 1 campo, ${CORPO_COM_CAMPOS}`,
    )
  })

  it('com Y = 0 diz que não há formulário na página', () => {
    render(<NenhumCampo y={0} onTentarDeNovo={vi.fn()} onVerDados={vi.fn()} />)
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Nenhum formulário nesta página',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'Não achei campos de formulário visíveis. Formulários dentro de iframe de outro domínio ficam de fora.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText(/Encontrei/)).toBeNull()
  })

  it('ensina o caminho do Inserir', () => {
    render(<NenhumCampo y={3} onTentarDeNovo={vi.fn()} onVerDados={vi.fn()} />)
    expect(
      screen.getByText('Dá para inserir campo a campo:'),
    ).toBeInTheDocument()
    for (const passo of ['botão direito', 'Botaí', 'Inserir', 'CPF']) {
      expect(screen.getByText(passo)).toBeInTheDocument()
    }
  })

  it('"Tentar de novo" e "Ver os dados" chamam os callbacks', async () => {
    const tentar = vi.fn()
    const dados = vi.fn()
    const user = userEvent.setup()
    render(<NenhumCampo y={3} onTentarDeNovo={tentar} onVerDados={dados} />)
    await user.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    await user.click(screen.getByRole('button', { name: 'Ver os dados' }))
    expect(tentar).toHaveBeenCalledTimes(1)
    expect(dados).toHaveBeenCalledTimes(1)
  })
})
