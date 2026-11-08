import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError } from '../api'
import type { LinhaOrcamento, RelatorioOrcamento } from '../lib/orcamento'
import { LinhaDoOrcamento, OrcamentoPage } from './orcamento'
import metaHistorias, * as todasAsHistorias from './orcamento.stories'

vi.mock('../api', async (importOriginal) => {
  const real = await importOriginal<typeof import('../api')>()
  return { ...real, api: vi.fn() }
})

afterEach(() => {
  vi.clearAllMocks()
})

const linhaDe = (
  id: string,
  nome: string,
  orcado: number | null,
  gasto: number,
  patch: Partial<LinhaOrcamento> = {},
): LinhaOrcamento => ({
  category_id: id,
  category_name: nome,
  parent_name: null,
  budget_cents: orcado,
  spent_cents: gasto,
  budgetable: true,
  average_3m_cents: 0,
  ...patch,
})

const relatorio = (
  patch: Partial<RelatorioOrcamento> = {},
): RelatorioOrcamento => ({
  month: '2026-08',
  rows: [
    linhaDe('c-mercado', 'Mercado', 40000, 52000, { average_3m_cents: 38000 }),
    linhaDe('c-lazer', 'Lazer', 20000, 5000),
    linhaDe('c-luz', 'Luz', 10000, 8500, { parent_name: 'Casa' }),
    linhaDe('c-transp', 'Transporte', null, 12000, { average_3m_cents: 11000 }),
    linhaDe('c-pets', 'Pets', null, 0),
  ],
  total_budget_cents: 70000,
  budgeted_spent_cents: 65500,
  uncategorized_spent_cents: 3000,
  ...patch,
})

const setembro = relatorio({
  month: '2026-09',
  rows: [linhaDe('c-mercado', 'Mercado', 10000, 0)],
  total_budget_cents: 10000,
  budgeted_spent_cents: 0,
  uncategorized_spent_cents: 0,
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

const HOJE = '2026-08-10'
const linha = (nome: string) => screen.getByRole('listitem', { name: nome })

async function montar(opts?: Parameters<typeof mockApi>[0]) {
  mockApi(opts)
  const user = userEvent.setup()
  render(<OrcamentoPage mesInicial="2026-08" hoje={HOJE} />)
  await screen.findByText('agosto de 2026')
  await screen.findByRole('region', { name: 'Resumo do mês' })
  return user
}

describe('OrcamentoPage — leitura', () => {
  it('mostra os quatro KPIs do mês', async () => {
    await montar()
    const kpis = screen.getByRole('region', { name: 'Resumo do mês' })
    expect(within(kpis).getByText('Orçado no mês')).toBeInTheDocument()
    expect(within(kpis).getByText('R$ 700,00')).toBeInTheDocument()
    expect(
      within(kpis).getByText('3 categorias com limite'),
    ).toBeInTheDocument()
    expect(within(kpis).getByText('R$ 655,00')).toBeInTheDocument()
    expect(
      within(kpis).getByText(/94% do orçado · faltam 21 dias/),
    ).toBeInTheDocument()
    expect(within(kpis).getByText('R$ 165,00')).toBeInTheDocument()
    expect(within(kpis).getByText('R$ 120,00')).toBeInTheDocument()
    expect(
      within(kpis).getByText('1 categoria acima do limite'),
    ).toBeInTheDocument()
  })

  it('desenha a marca de hoje na barra do mês corrente', async () => {
    await montar()
    expect(screen.getByTestId('marca-de-hoje')).toHaveStyle({ left: '32%' })
    expect(screen.getByText('hoje · dia 10 (32%)')).toBeInTheDocument()
    expect(screen.getByText('1 ago')).toBeInTheDocument()
    expect(screen.getByText('31 ago')).toBeInTheDocument()
  })

  it('sem marca de hoje em outro mês', async () => {
    mockApi({ get: () => relatorio({ month: '2026-07' }) })
    render(<OrcamentoPage mesInicial="2026-07" hoje={HOJE} />)
    await screen.findByText('julho de 2026')
    await screen.findByRole('region', { name: 'Resumo do mês' })
    expect(screen.queryByTestId('marca-de-hoje')).not.toBeInTheDocument()
    expect(screen.queryByText(/faltam/)).not.toBeInTheDocument()
  })

  it('estourado e atenção aparecem em texto, com a nota de cada um', async () => {
    await montar()
    const mercado = linha('Mercado')
    expect(within(mercado).getByText('Estourado')).toBeInTheDocument()
    expect(
      within(mercado).getByText('R$ 120,00 acima do limite'),
    ).toBeInTheDocument()
    const luz = linha('Casa › Luz')
    expect(within(luz).getByText('Atenção')).toBeInTheDocument()
    expect(
      within(luz).getByText(/Restam R\$ 15,00 · 80% ou mais já usado/),
    ).toBeInTheDocument()
    const lazer = linha('Lazer')
    expect(within(lazer).queryByText('Atenção')).not.toBeInTheDocument()
    expect(within(lazer).getByText('Restam R$ 150,00')).toBeInTheDocument()
  })

  it('lista as categorias sem orçamento do maior gasto para o menor', async () => {
    await montar()
    const secao = screen.getByRole('region', {
      name: 'Categorias sem orçamento',
    })
    const nomes = within(secao)
      .getAllByRole('listitem')
      .map((li) => li.getAttribute('aria-label'))
    expect(nomes).toEqual(['Transporte sem orçamento', 'Pets sem orçamento'])
    expect(
      within(secao).getAllByRole('button', { name: /Definir limite de/ }),
    ).toHaveLength(2)
  })

  it('mostra o gasto sem categoria com o atalho para classificar', async () => {
    await montar()
    expect(screen.getByText(/Sem categoria: R\$ 30,00/)).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Classificar agora' }),
    ).toHaveAttribute('href', '#/extrato')
  })

  it('sem nenhum limite convida a definir o primeiro', async () => {
    await montar({
      get: () =>
        relatorio({
          rows: [linhaDe('c-transp', 'Transporte', null, 12000)],
          total_budget_cents: 0,
          budgeted_spent_cents: 0,
          uncategorized_spent_cents: 0,
        }),
    })
    expect(screen.getByText(/Defina um limite abaixo/)).toBeInTheDocument()
    expect(
      screen.queryByRole('progressbar', { name: 'Uso do orçamento do mês' }),
    ).not.toBeInTheDocument()
  })
})

describe('OrcamentoPage — estados', () => {
  it('carregando mostra o esqueleto e o aviso do mês', async () => {
    vi.mocked(api).mockImplementation(() => new Promise(() => {}))
    const { container } = render(
      <OrcamentoPage mesInicial="2026-08" hoje={HOJE} />,
    )
    expect(
      await screen.findByText('Carregando o orçamento de agosto…'),
    ).toBeInTheDocument()
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull()
  })

  it('erro mostra a causa e deixa tentar de novo', async () => {
    let tentativa = 0
    vi.mocked(api).mockImplementation(async () => {
      if (++tentativa === 1)
        throw new ApiError(500, 'internal', 'o servidor não respondeu')
      return relatorio()
    })
    const user = userEvent.setup()
    render(<OrcamentoPage mesInicial="2026-08" hoje={HOJE} />)
    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveTextContent('Não foi possível carregar o orçamento')
    expect(alerta).toHaveTextContent('o servidor não respondeu')
    await user.click(
      within(alerta).getByRole('button', { name: 'Tentar de novo' }),
    )
    expect(
      await screen.findByRole('region', { name: 'Resumo do mês' }),
    ).toBeInTheDocument()
  })

  it('sem categoria de despesa mostra o estado vazio com o caminho para Categorias', async () => {
    mockApi({
      get: () =>
        relatorio({
          rows: [],
          total_budget_cents: 0,
          budgeted_spent_cents: 0,
          uncategorized_spent_cents: 0,
        }),
    })
    render(<OrcamentoPage mesInicial="2026-08" hoje={HOJE} />)
    expect(
      await screen.findByText('Nenhuma categoria de despesa'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Ir para Categorias' }),
    ).toHaveAttribute('href', '#/categorias')
  })
})

describe('OrcamentoPage — edição', () => {
  it('Editar abre o painel com o limite atual e a média dos 3 meses', async () => {
    const user = await montar()
    await user.click(
      screen.getByRole('button', { name: 'Editar limite de Mercado' }),
    )
    const form = screen.getByRole('form', { name: 'Editar limite de Mercado' })
    expect(
      within(form).getByLabelText('Limite de Mercado em agosto'),
    ).toHaveValue('R$ 400,00')
    expect(
      within(form).getByText('Média dos últimos 3 meses: R$ 380,00'),
    ).toBeInTheDocument()
  })

  it('salva o valor digitado em centavos', async () => {
    const user = await montar()
    await user.click(
      screen.getByRole('button', { name: 'Editar limite de Lazer' }),
    )
    const form = screen.getByRole('form', { name: 'Editar limite de Lazer' })
    const campo = within(form).getByLabelText('Limite de Lazer em agosto')
    await user.clear(campo)
    await user.type(campo, '250,00')
    await user.click(within(form).getByRole('button', { name: 'Salvar' }))
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith('/api/budgets/2026-08/c-lazer', {
        method: 'PUT',
        body: JSON.stringify({ amount_cents: 25000 }),
      }),
    )
  })

  it.each([
    ['texto', 'abc'],
    ['zero', '0'],
  ])('valor %s mostra o erro e não chama a API', async (_t, digitado) => {
    const user = await montar()
    await user.click(
      screen.getByRole('button', { name: 'Editar limite de Lazer' }),
    )
    const form = screen.getByRole('form', { name: 'Editar limite de Lazer' })
    const campo = within(form).getByLabelText('Limite de Lazer em agosto')
    await user.clear(campo)
    await user.type(campo, digitado)
    await user.click(within(form).getByRole('button', { name: 'Salvar' }))
    expect(within(form).getByRole('alert')).toHaveTextContent(/valor/i)
    expect(
      vi.mocked(api).mock.calls.filter(([, i]) => i?.method === 'PUT'),
    ).toHaveLength(0)
  })

  it('Definir limite abre o painel vazio com a média como sugestão', async () => {
    const user = await montar()
    await user.click(
      screen.getByRole('button', { name: 'Definir limite de Transporte' }),
    )
    const form = screen.getByRole('form', {
      name: 'Definir limite de Transporte',
    })
    expect(
      within(form).getByLabelText('Limite de Transporte em agosto'),
    ).toHaveValue('')
    expect(
      within(form).getByText('Média dos últimos 3 meses: R$ 110,00'),
    ).toBeInTheDocument()
    expect(
      within(form).queryByRole('button', { name: 'Remover limite' }),
    ).not.toBeInTheDocument()
    await user.type(
      within(form).getByLabelText('Limite de Transporte em agosto'),
      '150',
    )
    await user.click(within(form).getByRole('button', { name: 'Salvar' }))
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith('/api/budgets/2026-08/c-transp', {
        method: 'PUT',
        body: JSON.stringify({ amount_cents: 15000 }),
      }),
    )
  })

  it('sem histórico a dica diz isso', async () => {
    const user = await montar()
    await user.click(
      screen.getByRole('button', { name: 'Definir limite de Pets' }),
    )
    expect(
      screen.getByText('Sem gasto nos últimos 3 meses.'),
    ).toBeInTheDocument()
  })

  it('Remover limite apaga e Cancelar só fecha', async () => {
    const user = await montar()
    await user.click(
      screen.getByRole('button', { name: 'Editar limite de Lazer' }),
    )
    const form = screen.getByRole('form', { name: 'Editar limite de Lazer' })
    await user.click(within(form).getByRole('button', { name: 'Cancelar' }))
    expect(
      screen.queryByRole('form', { name: 'Editar limite de Lazer' }),
    ).not.toBeInTheDocument()
    expect(
      vi.mocked(api).mock.calls.filter(([, i]) => i?.method === 'DELETE'),
    ).toHaveLength(0)

    await user.click(
      screen.getByRole('button', { name: 'Editar limite de Lazer' }),
    )
    await user.click(
      within(
        screen.getByRole('form', { name: 'Editar limite de Lazer' }),
      ).getByRole('button', { name: 'Remover limite' }),
    )
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith('/api/budgets/2026-08/c-lazer', {
        method: 'DELETE',
      }),
    )
  })

  it('mostra o erro do servidor dentro do painel', async () => {
    const user = await montar({
      other: () => {
        throw new ApiError(
          422,
          'constraint_violation',
          'categoria arquivada não aceita orçamento',
        )
      },
    })
    await user.click(
      screen.getByRole('button', { name: 'Editar limite de Lazer' }),
    )
    const form = screen.getByRole('form', { name: 'Editar limite de Lazer' })
    await user.click(within(form).getByRole('button', { name: 'Salvar' }))
    expect(await within(form).findByRole('alert')).toHaveTextContent(
      /arquivada/,
    )
  })

  it('linha que não aceita mais limite só oferece remover', async () => {
    await montar({
      get: () =>
        relatorio({
          rows: [
            linhaDe('c-velha', 'Antiga', 5000, 1000, { budgetable: false }),
          ],
          total_budget_cents: 5000,
          budgeted_spent_cents: 1000,
          uncategorized_spent_cents: 0,
        }),
    })
    const velha = linha('Antiga')
    expect(
      within(velha).queryByRole('button', { name: /Editar limite/ }),
    ).not.toBeInTheDocument()
    expect(
      within(velha).getByText(/não aceita novo limite/),
    ).toBeInTheDocument()
    expect(
      within(velha).getByRole('button', { name: 'Remover limite de Antiga' }),
    ).toBeInTheDocument()
  })
})

describe('OrcamentoPage — mês e cópia', () => {
  it('troca de mês e recarrega', async () => {
    const user = await montar()
    await user.click(screen.getByRole('button', { name: 'Mês anterior' }))
    expect(await screen.findByText('julho de 2026')).toBeInTheDocument()
    expect(api).toHaveBeenLastCalledWith('/api/budgets?month=2026-07')
    await user.click(screen.getByRole('button', { name: 'Próximo mês' }))
    await user.click(screen.getByRole('button', { name: 'Próximo mês' }))
    expect(await screen.findByText('setembro de 2026')).toBeInTheDocument()
  })

  it.each([
    [{ copied: 2, skipped: 1 }, '2 copiados, 1 ignorado.'],
    [
      { copied: 0, skipped: 0 },
      'O mês anterior não tem orçamento para copiar.',
    ],
  ])('copiar do mês anterior informa %j', async (resposta, texto) => {
    const user = await montar({ other: () => resposta })
    await user.click(
      screen.getByRole('button', { name: 'Copiar do mês anterior' }),
    )
    expect(await screen.findByText(texto)).toBeInTheDocument()
    expect(api).toHaveBeenCalledWith('/api/budgets/2026-08/copy-previous', {
      method: 'POST',
    })
  })
})

function suspensa<T>() {
  let resolver!: (v: T) => void
  const promessa = new Promise<T>((r) => {
    resolver = r
  })
  return { promessa, resolver }
}
const liberar = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0))
  })

describe('mutação lenta com troca de mês', () => {
  function mockLento(pendente: Promise<unknown>) {
    vi.mocked(api).mockImplementation(
      async (path: string, init?: RequestInit) => {
        if ((init?.method ?? 'GET') === 'GET')
          return path.endsWith('2026-09') ? setembro : relatorio()
        return pendente
      },
    )
  }

  async function irParaSetembroEConcluir(
    resolver: () => void,
    user: ReturnType<typeof userEvent.setup>,
  ) {
    await user.click(screen.getByRole('button', { name: 'Próximo mês' }))
    expect(await screen.findByText('setembro de 2026')).toBeInTheDocument()
    await waitFor(() =>
      expect(
        within(linha('Mercado')).getByText(/de R\$ 100,00/),
      ).toBeInTheDocument(),
    )
    await act(async () => {
      resolver()
      await new Promise((r) => setTimeout(r, 0))
    })
  }

  function setembroContinuaNaTela() {
    expect(screen.getByText('setembro de 2026')).toBeInTheDocument()
    expect(
      within(linha('Mercado')).getByText(/de R\$ 100,00/),
    ).toBeInTheDocument()
    expect(
      within(linha('Mercado')).queryByText('Estourado'),
    ).not.toBeInTheDocument()
    const recargasDeAgosto = vi
      .mocked(api)
      .mock.calls.filter(([p]) => p === '/api/budgets?month=2026-08')
    expect(recargasDeAgosto).toHaveLength(1)
  }

  async function iniciar() {
    render(<OrcamentoPage mesInicial="2026-08" hoje={HOJE} />)
    await screen.findByText('agosto de 2026')
    await screen.findByRole('region', { name: 'Resumo do mês' })
    return userEvent.setup()
  }

  it('salvar em agosto e trocar para setembro não publica agosto sob setembro', async () => {
    const { promessa, resolver } = suspensa<unknown>()
    mockLento(promessa)
    const user = await iniciar()
    await user.click(
      screen.getByRole('button', { name: 'Definir limite de Transporte' }),
    )
    const form = screen.getByRole('form', {
      name: 'Definir limite de Transporte',
    })
    await user.type(
      within(form).getByLabelText('Limite de Transporte em agosto'),
      '150',
    )
    await user.click(within(form).getByRole('button', { name: 'Salvar' }))
    await irParaSetembroEConcluir(() => resolver({ ok: true }), user)
    setembroContinuaNaTela()
  })

  it('remover em agosto e trocar para setembro não publica agosto sob setembro', async () => {
    const { promessa, resolver } = suspensa<unknown>()
    mockLento(promessa)
    const user = await iniciar()
    await user.click(
      screen.getByRole('button', { name: 'Editar limite de Lazer' }),
    )
    await user.click(
      within(
        screen.getByRole('form', { name: 'Editar limite de Lazer' }),
      ).getByRole('button', { name: 'Remover limite' }),
    )
    await irParaSetembroEConcluir(() => resolver({ ok: true }), user)
    setembroContinuaNaTela()
  })

  it('copiar em agosto e trocar para setembro não publica agosto nem o aviso sob setembro', async () => {
    const { promessa, resolver } = suspensa<unknown>()
    mockLento(promessa)
    const user = await iniciar()
    await user.click(
      screen.getByRole('button', { name: 'Copiar do mês anterior' }),
    )
    await irParaSetembroEConcluir(
      () => resolver({ copied: 1, skipped: 0 }),
      user,
    )
    setembroContinuaNaTela()
    expect(
      screen.queryByText('1 copiado, 0 ignorados.'),
    ).not.toBeInTheDocument()
  })
})

describe('mutação lenta com outra seleção', () => {
  function mockPendente(pendente: Promise<unknown>) {
    vi.mocked(api).mockImplementation(
      async (_path: string, init?: RequestInit) =>
        (init?.method ?? 'GET') === 'GET' ? relatorio() : pendente,
    )
  }

  async function iniciar() {
    render(<OrcamentoPage mesInicial="2026-08" hoje={HOJE} />)
    await screen.findByRole('region', { name: 'Resumo do mês' })
    return userEvent.setup()
  }

  it('salvar em voo não fecha o editor reaberto depois de Cancelar', async () => {
    const { promessa, resolver } = suspensa<unknown>()
    mockPendente(promessa)
    const user = await iniciar()
    await user.click(
      screen.getByRole('button', { name: 'Editar limite de Lazer' }),
    )
    const antigo = screen.getByRole('form', { name: 'Editar limite de Lazer' })
    await user.click(within(antigo).getByRole('button', { name: 'Salvar' }))
    await user.click(within(antigo).getByRole('button', { name: 'Cancelar' }))

    await user.click(
      screen.getByRole('button', { name: 'Editar limite de Lazer' }),
    )
    const novo = screen.getByRole('form', { name: 'Editar limite de Lazer' })
    const campo = within(novo).getByLabelText('Limite de Lazer em agosto')
    await user.clear(campo)
    await user.type(campo, '999')

    await act(async () => {
      resolver({ ok: true })
    })
    await liberar()

    expect(
      within(
        screen.getByRole('form', { name: 'Editar limite de Lazer' }),
      ).getByLabelText('Limite de Lazer em agosto'),
    ).toHaveValue('999')
  })

  it('salvar uma categoria em voo não fecha o editor de outra', async () => {
    const { promessa, resolver } = suspensa<unknown>()
    mockPendente(promessa)
    const user = await iniciar()
    await user.click(
      screen.getByRole('button', { name: 'Editar limite de Lazer' }),
    )
    await user.click(
      within(
        screen.getByRole('form', { name: 'Editar limite de Lazer' }),
      ).getByRole('button', { name: 'Salvar' }),
    )

    await user.click(
      screen.getByRole('button', { name: 'Editar limite de Mercado' }),
    )
    const outro = screen.getByRole('form', { name: 'Editar limite de Mercado' })
    const campo = within(outro).getByLabelText('Limite de Mercado em agosto')
    await user.clear(campo)
    await user.type(campo, '777')

    await act(async () => {
      resolver({ ok: true })
    })
    await liberar()

    expect(
      within(
        screen.getByRole('form', { name: 'Editar limite de Mercado' }),
      ).getByLabelText('Limite de Mercado em agosto'),
    ).toHaveValue('777')
  })
})

const { default: _meta, ...historias } = todasAsHistorias

describe('orcamento.stories — os estados da linha', () => {
  it('cada story mostra o estado que o nome promete', () => {
    const esperado: Record<string, (el: HTMLElement) => void> = {
      Dentro: (el) => {
        expect(within(el).getByText('25%')).toBeInTheDocument()
        expect(within(el).queryByText('Atenção')).not.toBeInTheDocument()
        expect(within(el).queryByText('Estourado')).not.toBeInTheDocument()
      },
      Atencao: (el) => {
        expect(within(el).getByText('Atenção')).toBeInTheDocument()
        expect(within(el).getByText('85%')).toBeInTheDocument()
      },
      ExatamenteCem: (el) => {
        expect(within(el).getByText('Atenção')).toBeInTheDocument()
        expect(within(el).getByText('100%')).toBeInTheDocument()
        expect(
          within(el).getByText('Restam R$ 0,00 · 80% ou mais já usado'),
        ).toBeInTheDocument()
      },
      Estourado: (el) => {
        expect(within(el).getByText('Estourado')).toBeInTheDocument()
        expect(within(el).getByText('130%')).toBeInTheDocument()
      },
      NaoOrcavel: (el) => {
        expect(
          within(el).queryByRole('button', { name: /Editar limite/ }),
        ).not.toBeInTheDocument()
        expect(
          within(el).getByText(/não aceita novo limite/),
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
