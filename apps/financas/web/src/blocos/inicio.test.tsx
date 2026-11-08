import { render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError } from '../api'
import { limparRequisicoesEmVoo } from '../lib/em-voo'
import { BlocoMetas, ConteudoMetas } from './BlocoMetas'
import { BlocoOrcamento, ConteudoOrcamento } from './BlocoOrcamento'
import * as todasAsHistorias from './inicio.stories'
import { linhaOrc, metasDoDono, orcamentoDoMes } from './inicio.stories'

vi.mock('../api', async (importOriginal) => {
  const real = await importOriginal<typeof import('../api')>()
  return { ...real, api: vi.fn() }
})

// Relógio fixo: o bloco do orçamento pergunta ao app qual é o mês corrente.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-07T15:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
  limparRequisicoesEmVoo()
  vi.clearAllMocks()
})

describe('BlocoOrcamento', () => {
  it('mostra o mês, o total, o chip de estouradas e as quatro categorias mais urgentes', async () => {
    vi.mocked(api).mockResolvedValue(orcamentoDoMes)
    render(<BlocoOrcamento />)
    expect(
      await screen.findByText('nov/26 · R$ 4.542,20 de R$ 5.080,00'),
    ).toBeInTheDocument()
    expect(api).toHaveBeenCalledWith('/api/budgets?month=2026-11')
    expect(screen.getByText('2 estouradas')).toBeInTheDocument()
    expect(
      screen.getByRole('progressbar', { name: 'Uso do orçamento do mês' }),
    ).toHaveAttribute('aria-valuenow', '89')
    const nomes = screen.getAllByRole('listitem').map((li) => li.textContent)
    expect(nomes).toEqual([
      'Lazer113%',
      'Mercado112%',
      'Moradia94%',
      'Transporte85%',
    ])
    expect(
      screen.getByRole('link', { name: 'Ver o orçamento →' }),
    ).toHaveAttribute('href', '#/orcamento')
  })

  it('sem estouro, mas com categoria em atenção, o chip diz quantas', async () => {
    vi.mocked(api).mockResolvedValue({
      ...orcamentoDoMes,
      rows: [
        linhaOrc('Moradia', 210000, 198000),
        linhaOrc('Lazer', 40000, 5000),
      ],
    })
    render(<BlocoOrcamento />)
    expect(await screen.findByText('1 em atenção')).toBeInTheDocument()
  })

  it('sem nenhum limite mostra o vazio com o caminho para definir', async () => {
    vi.mocked(api).mockResolvedValue({
      ...orcamentoDoMes,
      rows: [linhaOrc('Pets', null, 9000)],
      total_budget_cents: 0,
      budgeted_spent_cents: 0,
    })
    render(<BlocoOrcamento />)
    expect(
      await screen.findByText('Nenhum limite definido neste mês.'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Definir limites' }),
    ).toHaveAttribute('href', '#/orcamento')
  })

  it('carregando mostra o esqueleto e erro fica contido no bloco', async () => {
    vi.mocked(api).mockImplementation(() => new Promise(() => {}))
    const { container, unmount } = render(<BlocoOrcamento />)
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull()
    unmount()
    limparRequisicoesEmVoo()

    vi.mocked(api).mockRejectedValue(
      new ApiError(500, 'internal', 'o servidor não respondeu'),
    )
    render(<BlocoOrcamento />)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'o servidor não respondeu',
    )
  })
})

describe('BlocoMetas', () => {
  it('mostra o guardado, as abertas com a atrasada primeiro e esconde a concluída', async () => {
    vi.mocked(api).mockResolvedValue(metasDoDono)
    render(<BlocoMetas />)
    expect(
      await screen.findByText('R$ 11.370,00 guardados em 4 metas'),
    ).toBeInTheDocument()
    const itens = screen.getAllByRole('listitem')
    expect(itens).toHaveLength(3)
    expect(within(itens[0]).getByText('Reforma da cozinha')).toBeInTheDocument()
    expect(
      within(itens[0]).getByText('Atrasada · prazo era out/26'),
    ).toBeInTheDocument()
    expect(
      within(itens[1]).getByText('R$ 418,75 por mês até jun/27'),
    ).toBeInTheDocument()
    expect(
      within(itens[2]).getByText('R$ 876,00 por mês até mar/27'),
    ).toBeInTheDocument()
    expect(screen.queryByText('Curso de inglês')).not.toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Ver as metas →' }),
    ).toHaveAttribute('href', '#/metas')
  })

  it('mostra no máximo três metas em aberto', async () => {
    vi.mocked(api).mockResolvedValue([
      ...metasDoDono,
      { ...metasDoDono[0], id: 'extra', name: 'Extra' },
    ])
    render(<BlocoMetas />)
    await screen.findByText(/guardados em 5 metas/)
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
  })

  it('sem meta nenhuma convida a criar a primeira', async () => {
    vi.mocked(api).mockResolvedValue([])
    render(<BlocoMetas />)
    expect(await screen.findByText('Nenhuma meta ainda.')).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Criar uma meta' }),
    ).toHaveAttribute('href', '#/metas')
  })

  it('todas concluídas diz isso', async () => {
    vi.mocked(api).mockResolvedValue([metasDoDono[2]])
    render(<BlocoMetas />)
    expect(
      await screen.findByText('Todas as metas estão concluídas.'),
    ).toBeInTheDocument()
  })

  it('erro fica contido no bloco', async () => {
    vi.mocked(api).mockRejectedValue(
      new ApiError(500, 'internal', 'metas indisponíveis'),
    )
    render(<BlocoMetas />)
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'metas indisponíveis',
      ),
    )
  })
})

const { default: _meta, ...historias } = todasAsHistorias
// As stories exportam também as fixtures; só as que têm `render` são estados.
const estados = Object.entries(historias).filter(
  ([, h]) => typeof h === 'object' && h !== null && 'render' in h,
) as Array<
  [
    string,
    { args: Record<string, unknown>; render: (p: never) => React.ReactElement },
  ]
>

describe('inicio.stories — os estados dos blocos', () => {
  it('cada story mostra o estado que o nome promete', () => {
    const esperado: Record<string, (c: HTMLElement) => void> = {
      OrcamentoEstourado: (c) =>
        expect(within(c).getByText('Lazer')).toBeInTheDocument(),
      OrcamentoNoLimite: (c) => {
        expect(within(c).getAllByRole('listitem')).toHaveLength(2)
        expect(within(c).getByText('30%')).toBeInTheDocument()
      },
      MetasEmAndamento: (c) =>
        expect(
          within(c).getByText('Atrasada · prazo era out/26'),
        ).toBeInTheDocument(),
      MetasTodasConcluidas: (c) =>
        expect(
          within(c).getByText('Todas as metas estão concluídas.'),
        ).toBeInTheDocument(),
    }
    expect(estados.map(([n]) => n).sort()).toEqual(Object.keys(esperado).sort())
    for (const [nome, h] of estados) {
      const Componente = h.render as unknown as (
        p: Record<string, unknown>,
      ) => React.ReactElement
      const { container, unmount } = render(<Componente {...h.args} />)
      esperado[nome](container)
      unmount()
    }
  })
})

void ConteudoOrcamento
void ConteudoMetas
