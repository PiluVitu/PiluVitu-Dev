import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LinhaCampo } from '../lib/resultado'
import { LINHAS_DO_DESIGN, RESUMO_DO_DESIGN, resumoDe } from '../test/resumos'
import {
  ResultadoPreenchimento,
  type ResultadoPreenchimentoProps,
} from './resultado-preenchimento'

function props(
  extra: Partial<ResultadoPreenchimentoProps> = {},
): ResultadoPreenchimentoProps {
  return {
    resumo: RESUMO_DO_DESIGN,
    caminho: '/cadastro',
    nome: 'Maria Eduarda Souza',
    onMostrar: vi.fn(),
    onAbrirCaixa: vi.fn(),
    onVerDados: vi.fn(),
    ...extra,
  }
}

// Os ícones do Font Awesome também têm role="img", mas com aria-hidden: o único img visível é a barra.
const segmentos = () =>
  Array.from(screen.getByRole('img').children) as HTMLElement[]

afterEach(() => vi.restoreAllMocks())

describe('ResultadoPreenchimento (1c)', () => {
  it('mostra X de Y, o caminho da página e quem preencheu', () => {
    render(<ResultadoPreenchimento {...props()} />)
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: '12 de 14 campos preenchidos',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('/cadastro · com Maria Eduarda Souza'),
    ).toBeInTheDocument()
  })

  it('um segmento por campo: sólido para os preenchidos, tracejado para os demais', () => {
    render(<ResultadoPreenchimento {...props()} />)
    expect(
      screen.getByRole('img', { name: '12 de 14 campos preenchidos' }),
    ).toBeInTheDocument()
    expect(segmentos()).toHaveLength(14)
    expect(
      segmentos().filter((s) => s.classList.contains('bg-ok')),
    ).toHaveLength(12)
    expect(
      segmentos().filter((s) => s.classList.contains('border-dashed')),
    ).toHaveLength(2)
  })

  it('com mais de 40 campos os segmentos viram duas barras proporcionais', () => {
    const linhas = Array.from({ length: 10 }, (_, i) => ({
      documentId: 'doc-0',
      idx: 100 + i,
      rotulo: `Campo ${i}`,
      seletor: `input#c${i}`,
    }))
    render(
      <ResultadoPreenchimento {...props({ resumo: resumoDe(50, linhas) })} />,
    )
    expect(segmentos()).toHaveLength(2)
    expect(segmentos()[0]).toHaveStyle({ flexGrow: '50' })
    expect(segmentos()[1]).toHaveStyle({ flexGrow: '10' })
  })

  it('lista os não reconhecidos com rótulo e seletor; a mira manda a linha inteira', async () => {
    const mostrar = vi.fn()
    render(<ResultadoPreenchimento {...props({ onMostrar: mostrar })} />)
    expect(
      screen.getByRole('heading', { level: 2, name: 'Não reconhecidos' }),
    ).toBeInTheDocument()
    expect(screen.getByText('02')).toBeInTheDocument()
    const itens = within(screen.getByRole('list')).getAllByRole('listitem')
    expect(itens.map((item) => item.textContent)).toEqual([
      'Código de indicaçãoinput[name="ref_code"]',
      'Como nos conheceu?select#origem',
    ])
    await userEvent.setup().click(
      screen.getByRole('button', {
        name: 'Mostrar na página: Como nos conheceu?',
      }),
    )
    expect(mostrar).toHaveBeenCalledWith(LINHAS_DO_DESIGN[1])
    expect(
      screen.getByText(/Para esses, clique com o botão direito no campo e use/),
    ).toHaveTextContent(
      'Para esses, clique com o botão direito no campo e use piluvitu › Inserir.',
    )
  })

  it('mesmo seletor em frames diferentes: as duas linhas aparecem e cada mira vai para o seu documento', async () => {
    const erroDoReact = vi.spyOn(console, 'error')
    const mostrar = vi.fn()
    const linhas: LinhaCampo[] = [
      {
        documentId: 'topo',
        idx: 1,
        rotulo: 'Cupom',
        seletor: 'input:nth-of-type(1)',
      },
      {
        documentId: 'quadro',
        idx: 1,
        rotulo: 'Cupom do parceiro',
        seletor: 'input:nth-of-type(1)',
      },
    ]
    render(
      <ResultadoPreenchimento
        {...props({ resumo: resumoDe(3, linhas), onMostrar: mostrar })}
      />,
    )
    expect(
      within(screen.getByRole('list')).getAllByRole('listitem'),
    ).toHaveLength(2)
    await userEvent.setup().click(
      screen.getByRole('button', {
        name: 'Mostrar na página: Cupom do parceiro',
      }),
    )
    expect(mostrar).toHaveBeenCalledWith(linhas[1])
    expect(erroDoReact).not.toHaveBeenCalled()
  })

  it('campo sem rótulo mostra só o seletor', () => {
    const linha = {
      documentId: 'doc-0',
      idx: 9,
      rotulo: '',
      seletor: 'input:nth-of-type(3)',
    }
    render(
      <ResultadoPreenchimento {...props({ resumo: resumoDe(1, [linha]) })} />,
    )
    expect(screen.getByRole('listitem')).toHaveTextContent(
      /^input:nth-of-type\(3\)$/,
    )
    expect(
      screen.getByRole('button', {
        name: 'Mostrar na página: input:nth-of-type(3)',
      }),
    ).toBeInTheDocument()
  })

  it('tudo reconhecido: sem lista e sem dica, e o título no singular', () => {
    render(<ResultadoPreenchimento {...props({ resumo: resumoDe(1) })} />)
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: '1 de 1 campo preenchido',
      }),
    ).toBeInTheDocument()
    expect(screen.queryByText('Não reconhecidos')).toBeNull()
    expect(screen.queryByRole('list')).toBeNull()
    expect(screen.queryByText(/Para esses/)).toBeNull()
  })

  it('"Caixa de entrada" e "Ver os dados" chamam os callbacks', async () => {
    const caixa = vi.fn()
    const dados = vi.fn()
    const user = userEvent.setup()
    render(
      <ResultadoPreenchimento
        {...props({ onAbrirCaixa: caixa, onVerDados: dados })}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Caixa de entrada' }))
    await user.click(screen.getByRole('button', { name: 'Ver os dados' }))
    expect(caixa).toHaveBeenCalledTimes(1)
    expect(dados).toHaveBeenCalledTimes(1)
  })
})
