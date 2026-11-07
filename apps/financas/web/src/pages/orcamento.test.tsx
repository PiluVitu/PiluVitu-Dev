import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError } from '../api'
import type { RelatorioOrcamento } from '../lib/orcamento'
import { LinhaDoOrcamento, OrcamentoPage } from './orcamento'
import metaHistorias, * as todasAsHistorias from './orcamento.stories'

vi.mock('../api', async (importOriginal) => {
  const real = await importOriginal<typeof import('../api')>()
  return { ...real, api: vi.fn() }
})

afterEach(() => {
  vi.clearAllMocks()
})

const relatorio = (
  patch: Partial<RelatorioOrcamento> = {},
): RelatorioOrcamento => ({
  month: '2026-08',
  rows: [
    {
      category_id: 'c-mercado',
      category_name: 'Mercado',
      parent_name: null,
      budget_cents: 40000,
      spent_cents: 52000,
      budgetable: true,
    },
    {
      category_id: 'c-lazer',
      category_name: 'Lazer',
      parent_name: null,
      budget_cents: 20000,
      spent_cents: 5000,
      budgetable: true,
    },
    {
      category_id: 'c-luz',
      category_name: 'Luz',
      parent_name: 'Casa',
      budget_cents: null,
      spent_cents: 12000,
      budgetable: true,
    },
    {
      category_id: 'c-vazia',
      category_name: 'Transporte',
      parent_name: null,
      budget_cents: null,
      spent_cents: 0,
      budgetable: true,
    },
  ],
  total_budget_cents: 60000,
  budgeted_spent_cents: 57000,
  uncategorized_spent_cents: 3000,
  ...patch,
})

function mockApi(
  opts: {
    get?: (path: string) => unknown
    other?: (path: string, init: RequestInit) => unknown
  } = {},
) {
  vi.mocked(api).mockImplementation(
    async (path: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      if (method === 'GET') return opts.get ? opts.get(path) : relatorio()
      return opts.other ? opts.other(path, init ?? {}) : { ok: true }
    },
  )
}

const linha = (nome: string) => screen.getByRole('listitem', { name: nome })

describe('OrcamentoPage', () => {
  it('mostra o mês, o resumo e uma linha por categoria', async () => {
    mockApi()
    render(<OrcamentoPage mesInicial="2026-08" />)
    expect(await screen.findByText('agosto de 2026')).toBeInTheDocument()
    expect(api).toHaveBeenCalledWith('/api/budgets?month=2026-08')
    expect(linha('Mercado')).toBeInTheDocument()
    expect(linha('Casa › Luz')).toBeInTheDocument()
    const resumo = screen.getByRole('region', { name: 'Resumo do mês' })
    expect(within(resumo).getByText(/R\$ 600,00/)).toBeInTheDocument()
    expect(within(resumo).getByText(/R\$ 570,00/)).toBeInTheDocument()
  })

  it('destaca a categoria estourada com texto, não só com cor', async () => {
    mockApi()
    render(<OrcamentoPage mesInicial="2026-08" />)
    await screen.findByText('agosto de 2026')
    const mercado = linha('Mercado')
    expect(within(mercado).getByText('Estourado')).toBeInTheDocument()
    expect(within(mercado).getByText('130%')).toBeInTheDocument()
    expect(
      within(mercado).getByText(/R\$ 120,00 acima do orçamento/),
    ).toBeInTheDocument()
    expect(
      within(linha('Lazer')).queryByText('Estourado'),
    ).not.toBeInTheDocument()
    expect(within(linha('Lazer')).getByText('25%')).toBeInTheDocument()
  })

  it('mostra o gasto sem categoria como informação', async () => {
    mockApi()
    render(<OrcamentoPage mesInicial="2026-08" />)
    expect(
      await screen.findByText(/Sem categoria: R\$ 30,00/),
    ).toBeInTheDocument()
  })

  it('troca de mês e recarrega', async () => {
    mockApi()
    const user = userEvent.setup()
    render(<OrcamentoPage mesInicial="2026-08" />)
    await screen.findByText('agosto de 2026')
    await user.click(screen.getByRole('button', { name: 'Mês anterior' }))
    expect(await screen.findByText('julho de 2026')).toBeInTheDocument()
    expect(api).toHaveBeenLastCalledWith('/api/budgets?month=2026-07')
    await user.click(screen.getByRole('button', { name: 'Próximo mês' }))
    await user.click(screen.getByRole('button', { name: 'Próximo mês' }))
    expect(await screen.findByText('setembro de 2026')).toBeInTheDocument()
  })

  it('salva o valor digitado em centavos e recarrega', async () => {
    mockApi()
    const user = userEvent.setup()
    render(<OrcamentoPage mesInicial="2026-08" />)
    await screen.findByText('agosto de 2026')
    const luz = linha('Casa › Luz')
    await user.type(within(luz).getByLabelText('Orçamento de Luz'), '150,00')
    await user.click(within(luz).getByRole('button', { name: 'Salvar' }))
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith('/api/budgets/2026-08/c-luz', {
        method: 'PUT',
        body: JSON.stringify({ amount_cents: 15000 }),
      }),
    )
  })

  it('valor inválido mostra o erro e não chama a API', async () => {
    mockApi()
    const user = userEvent.setup()
    render(<OrcamentoPage mesInicial="2026-08" />)
    await screen.findByText('agosto de 2026')
    const luz = linha('Casa › Luz')
    await user.type(within(luz).getByLabelText('Orçamento de Luz'), 'abc')
    await user.click(within(luz).getByRole('button', { name: 'Salvar' }))
    expect(within(luz).getByRole('alert')).toHaveTextContent(/valor/i)
    expect(
      vi.mocked(api).mock.calls.filter(([, i]) => i?.method === 'PUT'),
    ).toHaveLength(0)
  })

  it('valor zero também é recusado na tela', async () => {
    mockApi()
    const user = userEvent.setup()
    render(<OrcamentoPage mesInicial="2026-08" />)
    await screen.findByText('agosto de 2026')
    const luz = linha('Casa › Luz')
    await user.type(within(luz).getByLabelText('Orçamento de Luz'), '0')
    await user.click(within(luz).getByRole('button', { name: 'Salvar' }))
    expect(within(luz).getByRole('alert')).toBeInTheDocument()
    expect(
      vi.mocked(api).mock.calls.filter(([, i]) => i?.method === 'PUT'),
    ).toHaveLength(0)
  })

  it('remove o orçamento de uma categoria', async () => {
    mockApi()
    const user = userEvent.setup()
    render(<OrcamentoPage mesInicial="2026-08" />)
    await screen.findByText('agosto de 2026')
    await user.click(
      within(linha('Lazer')).getByRole('button', { name: 'Remover' }),
    )
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith('/api/budgets/2026-08/c-lazer', {
        method: 'DELETE',
      }),
    )
    expect(
      within(linha('Casa › Luz')).queryByRole('button', { name: 'Remover' }),
    ).not.toBeInTheDocument()
  })

  it('copia do mês anterior e informa copiados e ignorados', async () => {
    mockApi({ other: () => ({ copied: 2, skipped: 1 }) })
    const user = userEvent.setup()
    render(<OrcamentoPage mesInicial="2026-08" />)
    await screen.findByText('agosto de 2026')
    await user.click(
      screen.getByRole('button', { name: 'Copiar do mês anterior' }),
    )
    expect(
      await screen.findByText('2 copiados, 1 ignorado.'),
    ).toBeInTheDocument()
    expect(api).toHaveBeenCalledWith('/api/budgets/2026-08/copy-previous', {
      method: 'POST',
    })
  })

  it('avisa quando o mês anterior não tinha orçamento', async () => {
    mockApi({ other: () => ({ copied: 0, skipped: 0 }) })
    const user = userEvent.setup()
    render(<OrcamentoPage mesInicial="2026-08" />)
    await screen.findByText('agosto de 2026')
    await user.click(
      screen.getByRole('button', { name: 'Copiar do mês anterior' }),
    )
    expect(
      await screen.findByText('O mês anterior não tem orçamento para copiar.'),
    ).toBeInTheDocument()
  })

  it('mostra o erro do servidor ao salvar', async () => {
    mockApi({
      other: () => {
        throw new ApiError(
          422,
          'constraint_violation',
          'categoria arquivada não aceita orçamento',
        )
      },
    })
    const user = userEvent.setup()
    render(<OrcamentoPage mesInicial="2026-08" />)
    await screen.findByText('agosto de 2026')
    const luz = linha('Casa › Luz')
    await user.type(within(luz).getByLabelText('Orçamento de Luz'), '10')
    await user.click(within(luz).getByRole('button', { name: 'Salvar' }))
    expect(await within(luz).findByRole('alert')).toHaveTextContent(/arquivada/)
  })

  it('mostra erro quando o carregamento falha', async () => {
    vi.mocked(api).mockRejectedValue(new ApiError(500, 'internal', 'falhou'))
    render(<OrcamentoPage mesInicial="2026-08" />)
    expect(await screen.findByRole('alert')).toHaveTextContent('falhou')
  })

  it('sem categoria de despesa mostra o estado vazio', async () => {
    mockApi({
      get: () =>
        relatorio({
          rows: [],
          total_budget_cents: 0,
          budgeted_spent_cents: 0,
          uncategorized_spent_cents: 0,
        }),
    })
    render(<OrcamentoPage mesInicial="2026-08" />)
    expect(
      await screen.findByText(/Nenhuma categoria de despesa/),
    ).toBeInTheDocument()
  })
})

describe('linha de categoria não orçável', () => {
  it('não mostra campo nem Salvar, só o aviso, e mantém Remover se há orçamento', async () => {
    mockApi({
      get: () =>
        relatorio({
          rows: [
            {
              category_id: 'c-velha',
              category_name: 'Antiga',
              parent_name: null,
              budget_cents: 5000,
              spent_cents: 1000,
              budgetable: false,
            },
          ],
        }),
    })
    render(<OrcamentoPage mesInicial="2026-08" />)
    await screen.findByText('agosto de 2026')
    const velha = linha('Antiga')
    expect(
      within(velha).queryByRole('button', { name: 'Salvar' }),
    ).not.toBeInTheDocument()
    expect(
      within(velha).queryByLabelText('Orçamento de Antiga'),
    ).not.toBeInTheDocument()
    expect(
      within(velha).getByText(/não aceita novo orçamento/),
    ).toBeInTheDocument()
    expect(
      within(velha).getByRole('button', { name: 'Remover' }),
    ).toBeInTheDocument()
  })
})

const { default: _meta, ...historias } = todasAsHistorias

describe('orcamento.stories — os estados da linha', () => {
  it('cada story mostra o estado que o nome promete', () => {
    const esperado: Record<string, (el: HTMLElement) => void> = {
      Dentro: (el) => {
        expect(within(el).getByText('25%')).toBeInTheDocument()
        expect(within(el).queryByText('Estourado')).not.toBeInTheDocument()
      },
      ExatamenteCem: (el) => {
        expect(within(el).getByText('100%')).toBeInTheDocument()
        expect(within(el).queryByText('Estourado')).not.toBeInTheDocument()
      },
      Estourado: (el) => {
        expect(within(el).getByText('Estourado')).toBeInTheDocument()
        expect(within(el).getByText('130%')).toBeInTheDocument()
      },
      SemOrcamento: (el) => {
        expect(within(el).queryByRole('progressbar')).not.toBeInTheDocument()
        expect(
          within(el).getByRole('button', { name: 'Salvar' }),
        ).toBeInTheDocument()
      },
      NaoOrcavel: (el) => {
        expect(
          within(el).queryByRole('button', { name: 'Salvar' }),
        ).not.toBeInTheDocument()
        expect(
          within(el).getByText(/não aceita novo orçamento/),
        ).toBeInTheDocument()
      },
    }
    expect(Object.keys(historias).sort()).toEqual(Object.keys(esperado).sort())

    for (const [nome, historia] of Object.entries(historias)) {
      const { container, unmount } = render(
        <ul>
          <LinhaDoOrcamento {...metaHistorias.args} {...historia.args} />
        </ul>,
      )
      esperado[nome](container.querySelector('li') as HTMLElement)
      unmount()
    }
  })
})
