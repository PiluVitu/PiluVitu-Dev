import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NewEntryPage } from './new-entry'

const contas = [
  {
    id: 'a1',
    name: 'Nubank',
    scope: 'PF',
    kind: 'checking',
    closing_day: null,
    due_day: null,
    balance_cents: 234012,
  },
  {
    id: 'a2',
    name: 'Nubank cartao',
    scope: 'PF',
    kind: 'credit_card',
    closing_day: 25,
    due_day: 5,
    balance_cents: -184790,
  },
]

const recorrentes = [
  {
    id: 'r1',
    description: 'Starlink',
    category_id: null,
    account_id: null,
    scope: 'PJ',
    day_of_month: 10,
    amount_min_cents: 18900,
    amount_max_cents: 18900,
    starts_on: '2026-01-01',
    ends_on: null,
    active: 1,
    notes: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'r2',
    description: 'DAS',
    category_id: null,
    account_id: null,
    scope: 'PJ',
    day_of_month: 20,
    amount_min_cents: 1200,
    amount_max_cents: 60000,
    starts_on: '2026-01-01',
    ends_on: null,
    active: 1,
    notes: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'r3',
    description: 'Ferramenta pausada',
    category_id: null,
    account_id: null,
    scope: 'PJ',
    day_of_month: 1,
    amount_min_cents: 5000,
    amount_max_cents: 5000,
    starts_on: '2026-01-01',
    ends_on: null,
    active: 0,
    notes: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
]

// As categorias que o GET devolve — SEM `?kind=`, então vêm os quatro
// tipos: o filtro segue o checkbox "Entrada", no cliente (7 linhas contra
// um refetch a cada toggle). `c-pj` é mãe de `c-das` (a hierarquia real
// semeada pela migration).
const categorias = [
  {
    id: 'c-mercado',
    parent_id: null,
    name: 'Mercado',
    kind: 'expense',
    slug: null,
    default_scope: null,
    archived_at: null,
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'c-pj',
    parent_id: null,
    name: 'Custos da PJ',
    kind: 'expense',
    slug: null,
    default_scope: 'PJ',
    archived_at: null,
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'c-das',
    parent_id: 'c-pj',
    name: 'DAS — Simples Nacional',
    kind: 'expense',
    slug: 'das',
    default_scope: 'PJ',
    archived_at: null,
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'c-freela',
    parent_id: null,
    name: 'Freela',
    kind: 'income',
    slug: null,
    default_scope: null,
    archived_at: null,
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'c-quitacao',
    parent_id: null,
    name: 'Quitacao de divida',
    kind: 'debt_settlement',
    slug: 'quitacao-divida',
    default_scope: null,
    archived_at: null,
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'c-transf',
    parent_id: null,
    name: 'Transferencia entre contas',
    kind: 'transfer',
    slug: 'transferencia-entre-contas',
    default_scope: null,
    archived_at: null,
    created_at: '2026-01-01T00:00:00Z',
  },
]

const payees = [{ id: 'p1', name: 'Padaria do Zé', kind: 'merchant' }]

function mockRoutes(post?: unknown, recs: unknown = recorrentes) {
  const fn = vi.fn(async (path: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      if (path.startsWith('/api/payees')) {
        return {
          status: 201,
          json: async () => ({
            ok: true,
            data: { id: 'p-novo', name: 'Mercado São Luiz', kind: 'merchant' },
            notifications: [],
          }),
        }
      }
      return (
        post ?? {
          status: 201,
          json: async () => ({
            ok: true,
            data: { id: 'novo' },
            notifications: [],
          }),
        }
      )
    }
    if (path.startsWith('/api/accounts')) {
      return {
        status: 200,
        json: async () => ({ ok: true, data: contas, notifications: [] }),
      }
    }
    if (path.startsWith('/api/recurring')) {
      return {
        status: 200,
        json: async () => ({ ok: true, data: recs, notifications: [] }),
      }
    }
    if (path.startsWith('/api/categories')) {
      return {
        status: 200,
        json: async () => ({ ok: true, data: categorias, notifications: [] }),
      }
    }
    if (path.startsWith('/api/payees')) {
      return {
        status: 200,
        json: async () => ({ ok: true, data: payees, notifications: [] }),
      }
    }
    throw new Error(`rota nao mockada: ${path}`)
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

function postBodyDe(
  fetchMock: ReturnType<typeof mockRoutes>,
  path: string,
): Record<string, unknown> {
  const call = fetchMock.mock.calls.find(
    ([p, init]) => p === path && (init as RequestInit)?.method === 'POST',
  )
  if (!call) throw new Error(`nenhum POST ${path}`)
  return JSON.parse((call[1] as RequestInit).body as string)
}

function rotulosDoSelect(label: string): string[] {
  return Array.from(
    (screen.getByLabelText(label) as HTMLSelectElement).options,
  ).map((o) => o.textContent ?? '')
}

function postBody(fetchMock: ReturnType<typeof mockRoutes>) {
  const call = fetchMock.mock.calls.find(
    ([, init]) => (init as RequestInit)?.method === 'POST',
  )
  return {
    path: call![0] as string,
    body: JSON.parse((call![1] as RequestInit).body as string),
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('NewEntryPage', () => {
  // A porta pra transferência mora AQUI, e não no nav, de propósito: o dono
  // vem a `#/lancar` pra registrar o pro-labore achando que é despesa, e é
  // aqui que ele precisa encontrar a correção. Ver `AbasLancar` (new-entry.tsx)
  // pro custo de nav medido em Chrome real.
  it('oferece a aba de transferência, com "Lançamento" marcada como a atual', async () => {
    mockRoutes()
    render(<NewEntryPage />)
    await waitFor(() =>
      expect(screen.getByLabelText('Conta')).toBeInTheDocument(),
    )

    const abas = screen.getByTestId('abas-lancar')
    const lancamento = within(abas).getByRole('link', { name: 'Lançamento' })
    const transferencia = within(abas).getByRole('link', {
      name: 'Transferência',
    })

    expect(lancamento).toHaveAttribute('aria-current', 'true')
    expect(transferencia).toHaveAttribute('href', '#/lancar/transferir')
    // ⚠️ Só a aba atual carrega `aria-current` — as duas marcadas mentiriam
    // pro leitor de tela sobre onde o dono está.
    expect(transferencia).not.toHaveAttribute('aria-current')
  })

  it('lanca uma saida simples com valor negativo em centavos', async () => {
    const fetchMock = mockRoutes()

    render(<NewEntryPage />)
    await waitFor(() =>
      expect(screen.getByLabelText('Conta')).toBeInTheDocument(),
    )

    fireEvent.change(screen.getByLabelText('Descrição'), {
      target: { value: 'Mercado' },
    })
    fireEvent.change(screen.getByLabelText('Valor'), {
      target: { value: '1.360,00' },
    })
    fireEvent.change(screen.getByLabelText('Data'), {
      target: { value: '2026-07-28' },
    })
    fireEvent.change(screen.getByLabelText('Conta'), {
      target: { value: 'a1' },
    })
    fireEvent.submit(screen.getByTestId('form-lancamento'))

    await waitFor(() => {
      const { path, body } = postBody(fetchMock)
      expect(path).toBe('/api/transactions')
      expect(body).toEqual({
        account_id: 'a1',
        amount_cents: -136000,
        purchase_date: '2026-07-28',
        description: 'Mercado',
        is_business: 0,
      })
    })
  })

  it('o toggle PJ marca is_business = 1', async () => {
    const fetchMock = mockRoutes()

    render(<NewEntryPage />)
    await waitFor(() =>
      expect(screen.getByLabelText('Conta')).toBeInTheDocument(),
    )

    fireEvent.change(screen.getByLabelText('Descrição'), {
      target: { value: 'Contador' },
    })
    fireEvent.change(screen.getByLabelText('Valor'), {
      target: { value: '275,00' },
    })
    fireEvent.change(screen.getByLabelText('Data'), {
      target: { value: '2026-07-05' },
    })
    fireEvent.click(screen.getByLabelText('PJ'))
    fireEvent.submit(screen.getByTestId('form-lancamento'))

    await waitFor(() => expect(postBody(fetchMock).body.is_business).toBe(1))
  })

  it('entrada manda valor positivo', async () => {
    const fetchMock = mockRoutes()

    render(<NewEntryPage />)
    await waitFor(() =>
      expect(screen.getByLabelText('Conta')).toBeInTheDocument(),
    )

    fireEvent.change(screen.getByLabelText('Descrição'), {
      target: { value: 'Freela' },
    })
    fireEvent.change(screen.getByLabelText('Valor'), {
      target: { value: '2.000,00' },
    })
    fireEvent.change(screen.getByLabelText('Data'), {
      target: { value: '2026-07-15' },
    })
    fireEvent.click(screen.getByLabelText('Entrada'))
    fireEvent.submit(screen.getByTestId('form-lancamento'))

    await waitFor(() =>
      expect(postBody(fetchMock).body.amount_cents).toBe(200000),
    )
  })

  // Task 7 da fatia ⑥ (docs/superpowers/specs/2026-07-27-financas-recorrentes-design.md
  // §3.1): a tela Lancar oferece "este lancamento e o Starlink de agosto".
  it('o select Recorrente lista so as ativas — a pausada nao aparece', async () => {
    mockRoutes()

    render(<NewEntryPage />)
    await waitFor(() =>
      expect(screen.getByLabelText('Recorrente')).toBeInTheDocument(),
    )

    const select = screen.getByLabelText('Recorrente') as HTMLSelectElement
    const rotulos = Array.from(select.options).map((o) => o.textContent)
    expect(rotulos).toContain('— nenhuma —')
    expect(rotulos.some((r) => r?.startsWith('Starlink'))).toBe(true)
    expect(rotulos.some((r) => r?.startsWith('DAS'))).toBe(true)
    expect(rotulos.some((r) => r?.includes('Ferramenta pausada'))).toBe(false)
  })

  it('escolher uma recorrente manda recurring_expense_id no POST /api/transactions', async () => {
    const fetchMock = mockRoutes()

    render(<NewEntryPage />)
    await waitFor(() =>
      expect(screen.getByLabelText('Recorrente')).toBeInTheDocument(),
    )

    fireEvent.change(screen.getByLabelText('Descrição'), {
      target: { value: 'Starlink de agosto' },
    })
    fireEvent.change(screen.getByLabelText('Valor'), {
      target: { value: '189,00' },
    })
    fireEvent.change(screen.getByLabelText('Data'), {
      target: { value: '2026-08-10' },
    })
    fireEvent.change(screen.getByLabelText('Conta'), {
      target: { value: 'a1' },
    })
    fireEvent.change(screen.getByLabelText('Recorrente'), {
      target: { value: 'r1' },
    })
    fireEvent.submit(screen.getByTestId('form-lancamento'))

    await waitFor(() => {
      const { path, body } = postBody(fetchMock)
      expect(path).toBe('/api/transactions')
      expect(body.recurring_expense_id).toBe('r1')
    })
  })

  it('sem escolher recorrente, a chave recurring_expense_id nao vai no corpo', async () => {
    const fetchMock = mockRoutes()

    render(<NewEntryPage />)
    await waitFor(() =>
      expect(screen.getByLabelText('Recorrente')).toBeInTheDocument(),
    )

    fireEvent.change(screen.getByLabelText('Descrição'), {
      target: { value: 'Mercado' },
    })
    fireEvent.change(screen.getByLabelText('Valor'), {
      target: { value: '50,00' },
    })
    fireEvent.change(screen.getByLabelText('Conta'), {
      target: { value: 'a1' },
    })
    fireEvent.submit(screen.getByTestId('form-lancamento'))

    await waitFor(() => {
      const { body } = postBody(fetchMock)
      expect('recurring_expense_id' in body).toBe(false)
    })
  })

  it('modo parcelado esconde o select Recorrente', async () => {
    mockRoutes()

    render(<NewEntryPage />)
    await waitFor(() =>
      expect(screen.getByLabelText('Recorrente')).toBeInTheDocument(),
    )

    fireEvent.click(screen.getByLabelText('Parcelado'))
    expect(screen.queryByLabelText('Recorrente')).not.toBeInTheDocument()
  })

  it('modo parcelado chama POST /api/installment-plans com o total positivo', async () => {
    const fetchMock = mockRoutes()

    render(<NewEntryPage />)
    await waitFor(() =>
      expect(screen.getByLabelText('Conta')).toBeInTheDocument(),
    )

    fireEvent.change(screen.getByLabelText('Descrição'), {
      target: { value: 'Geladeira' },
    })
    fireEvent.change(screen.getByLabelText('Valor'), {
      target: { value: '1.000,00' },
    })
    fireEvent.change(screen.getByLabelText('Data'), {
      target: { value: '2026-07-28' },
    })
    fireEvent.change(screen.getByLabelText('Conta'), {
      target: { value: 'a2' },
    })
    fireEvent.click(screen.getByLabelText('Parcelado'))
    fireEvent.change(screen.getByLabelText('Parcelas'), {
      target: { value: '3' },
    })
    fireEvent.submit(screen.getByTestId('form-lancamento'))

    await waitFor(() => {
      const { path, body } = postBody(fetchMock)
      expect(path).toBe('/api/installment-plans')
      expect(body).toEqual({
        account_id: 'a2',
        description: 'Geladeira',
        total_cents: 100000,
        installments_count: 3,
        purchase_date: '2026-07-28',
        is_business: 0,
      })
    })
  })

  it('mostra a previa das parcelas com o resto nas primeiras', async () => {
    mockRoutes()

    render(<NewEntryPage />)
    await waitFor(() =>
      expect(screen.getByLabelText('Conta')).toBeInTheDocument(),
    )

    fireEvent.change(screen.getByLabelText('Valor'), {
      target: { value: '100,00' },
    })
    fireEvent.click(screen.getByLabelText('Parcelado'))
    fireEvent.change(screen.getByLabelText('Parcelas'), {
      target: { value: '3' },
    })

    expect(screen.getByTestId('previa-parcelas')).toHaveTextContent(
      '3× de R$ 33,34 / R$ 33,33 / R$ 33,33',
    )
  })

  it('recusa valor invalido sem chamar a API', async () => {
    const fetchMock = mockRoutes()

    render(<NewEntryPage />)
    await waitFor(() =>
      expect(screen.getByLabelText('Conta')).toBeInTheDocument(),
    )

    fireEvent.change(screen.getByLabelText('Descrição'), {
      target: { value: 'Erro' },
    })
    fireEvent.change(screen.getByLabelText('Valor'), {
      target: { value: 'abc' },
    })
    fireEvent.submit(screen.getByTestId('form-lancamento'))

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Valor inválido'),
    )
    expect(
      fetchMock.mock.calls.some(
        ([, init]) => (init as RequestInit)?.method === 'POST',
      ),
    ).toBe(false)
  })

  it('sem Data preenchida, usa o dia de Teresina (nao UTC) como default', async () => {
    // 01:00 UTC de 01/08 e 22h de 31/07 em Teresina (UTC-3). new Date().
    // toISOString().slice(0,10) gravaria '2026-08-01' — um dia adiantado.
    // Fake só o Date (nao os timers): waitFor usa setTimeout de verdade por
    // baixo, e travaria se o relogio inteiro estivesse congelado.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-08-01T01:00:00Z'))
    try {
      const fetchMock = mockRoutes()

      render(<NewEntryPage />)
      await waitFor(() =>
        expect(screen.getByLabelText('Conta')).toBeInTheDocument(),
      )

      fireEvent.change(screen.getByLabelText('Descrição'), {
        target: { value: 'Tarde da noite' },
      })
      fireEvent.change(screen.getByLabelText('Valor'), {
        target: { value: '50,00' },
      })
      fireEvent.submit(screen.getByTestId('form-lancamento'))

      await waitFor(() =>
        expect(postBody(fetchMock).body.purchase_date).toBe('2026-07-31'),
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it('mostra o erro da API no submit', async () => {
    mockRoutes({
      status: 422,
      json: async () => ({
        ok: false,
        data: null,
        notifications: [
          {
            type: 'error',
            code: 'invalid_account',
            message: 'cartao sem dia de fechamento',
          },
        ],
      }),
    })

    render(<NewEntryPage />)
    await waitFor(() =>
      expect(screen.getByLabelText('Conta')).toBeInTheDocument(),
    )

    fireEvent.change(screen.getByLabelText('Descrição'), {
      target: { value: 'X' },
    })
    fireEvent.change(screen.getByLabelText('Valor'), {
      target: { value: '10,00' },
    })
    fireEvent.change(screen.getByLabelText('Data'), {
      target: { value: '2026-07-28' },
    })
    fireEvent.submit(screen.getByTestId('form-lancamento'))

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'cartao sem dia de fechamento',
      ),
    )
  })

  // Task 5 (ajuda contextual, §3.2 do spec): "Lançar" tem dois pontos —
  // Competência (ao lado de Data) e PJ/PF (ao lado do toggle PJ, também em
  // "Lançar / Contas"). Clique, não hover — mesmo motivo do resto da task.
  it('ajuda: "Competência" (ao lado de Data) abre no clique com o texto do fechamento da fatura', async () => {
    mockRoutes()
    const user = userEvent.setup()

    render(<NewEntryPage />)
    await waitFor(() =>
      expect(screen.getByLabelText('Conta')).toBeInTheDocument(),
    )

    await user.click(
      screen.getByRole('button', { name: 'Ajuda sobre Competência' }),
    )
    expect(await screen.findByText(/fatura fecha/)).toBeInTheDocument()
  })

  it('ajuda: "PJ / PF" (ao lado do toggle PJ) abre no clique', async () => {
    mockRoutes()
    const user = userEvent.setup()

    render(<NewEntryPage />)
    await waitFor(() =>
      expect(screen.getByLabelText('Conta')).toBeInTheDocument(),
    )

    await user.click(
      screen.getByRole('button', { name: 'Ajuda sobre PJ / PF' }),
    )
    expect(
      await screen.findByText(/dá para pagar algo PF pelo cartão PJ/),
    ).toBeInTheDocument()
    // O checkbox continua endereçável por label depois do ajuste de markup
    // (Ajuda foi movido pra FORA do <label>, nunca dentro).
    expect(screen.getByLabelText('PJ')).toBeInTheDocument()
  })

  // Categoria e Favorecido: os dois campos que faltavam pro dono conseguir
  // dizer PARA ONDE foi o dinheiro. O backend já aceitava os dois (nos dois
  // ramos, simples e parcelado) — quem nunca os enviava era esta tela.
  describe('categoria e favorecido', () => {
    it('lança COM categoria e favorecido — os dois vão no corpo', async () => {
      const fetchMock = mockRoutes()

      render(<NewEntryPage />)
      await waitFor(() =>
        expect(screen.getByLabelText('Categoria')).toBeInTheDocument(),
      )

      fireEvent.change(screen.getByLabelText('Descrição'), {
        target: { value: 'Pão' },
      })
      fireEvent.change(screen.getByLabelText('Valor'), {
        target: { value: '18,00' },
      })
      fireEvent.change(screen.getByLabelText('Data'), {
        target: { value: '2026-08-10' },
      })
      fireEvent.change(screen.getByLabelText('Conta'), {
        target: { value: 'a1' },
      })
      fireEvent.change(screen.getByLabelText('Categoria'), {
        target: { value: 'c-mercado' },
      })
      fireEvent.change(screen.getByLabelText('Favorecido'), {
        target: { value: 'p1' },
      })
      fireEvent.submit(screen.getByTestId('form-lancamento'))

      await waitFor(() => {
        const body = postBodyDe(fetchMock, '/api/transactions')
        expect(body.category_id).toBe('c-mercado')
        expect(body.payee_id).toBe('p1')
      })
    })

    // ⚠️ Ausência decide no backend: a chave tem que SUMIR do corpo, nunca
    // ir como string vazia (que viraria um id inválido, não um "não sei").
    it('lança SEM os dois: as chaves são OMITIDAS, nunca string vazia', async () => {
      const fetchMock = mockRoutes()

      render(<NewEntryPage />)
      await waitFor(() =>
        expect(screen.getByLabelText('Categoria')).toBeInTheDocument(),
      )

      fireEvent.change(screen.getByLabelText('Descrição'), {
        target: { value: 'Mercado' },
      })
      fireEvent.change(screen.getByLabelText('Valor'), {
        target: { value: '50,00' },
      })
      fireEvent.change(screen.getByLabelText('Data'), {
        target: { value: '2026-08-10' },
      })
      fireEvent.submit(screen.getByTestId('form-lancamento'))

      await waitFor(() => {
        const body = postBodyDe(fetchMock, '/api/transactions')
        expect('category_id' in body).toBe(false)
        expect('payee_id' in body).toBe(false)
      })
    })

    // O ramo parcelado propaga os dois pra CADA parcela (createInstallmentPlan)
    // — por isso os selects NÃO somem quando "Parcelado" é marcado, ao
    // contrário do select "Recorrente".
    it('parcelado COM categoria: os selects continuam visíveis e os campos vão no corpo', async () => {
      const fetchMock = mockRoutes()

      render(<NewEntryPage />)
      await waitFor(() =>
        expect(screen.getByLabelText('Categoria')).toBeInTheDocument(),
      )

      fireEvent.click(screen.getByLabelText('Parcelado'))
      expect(screen.getByLabelText('Categoria')).toBeInTheDocument()
      expect(screen.getByLabelText('Favorecido')).toBeInTheDocument()
      expect(screen.queryByLabelText('Recorrente')).not.toBeInTheDocument()

      fireEvent.change(screen.getByLabelText('Descrição'), {
        target: { value: 'Geladeira' },
      })
      fireEvent.change(screen.getByLabelText('Valor'), {
        target: { value: '1.000,00' },
      })
      fireEvent.change(screen.getByLabelText('Data'), {
        target: { value: '2026-08-10' },
      })
      fireEvent.change(screen.getByLabelText('Conta'), {
        target: { value: 'a2' },
      })
      fireEvent.change(screen.getByLabelText('Categoria'), {
        target: { value: 'c-mercado' },
      })
      fireEvent.change(screen.getByLabelText('Favorecido'), {
        target: { value: 'p1' },
      })
      fireEvent.change(screen.getByLabelText('Parcelas'), {
        target: { value: '3' },
      })
      fireEvent.submit(screen.getByTestId('form-lancamento'))

      await waitFor(() => {
        const body = postBodyDe(fetchMock, '/api/installment-plans')
        expect(body.category_id).toBe('c-mercado')
        expect(body.payee_id).toBe('p1')
        expect(body.installments_count).toBe(3)
      })
    })

    // ⚠️ `transfer`/`debt_settlement` ficam de fora dos DOIS estados do
    // toggle: são as duas classes que todo relatório de resultado exclui.
    it('o toggle "Entrada" troca a lista de categorias; transferência e quitação nunca aparecem', async () => {
      mockRoutes()

      render(<NewEntryPage />)
      await waitFor(() =>
        expect(screen.getByLabelText('Categoria')).toBeInTheDocument(),
      )

      // Despesa (padrão): hierarquia renderizada — a filha logo abaixo da mãe.
      expect(rotulosDoSelect('Categoria')).toEqual([
        '— sem categoria —',
        'Custos da PJ',
        '\u00a0\u00a0↳ DAS — Simples Nacional',
        'Mercado',
      ])

      fireEvent.click(screen.getByLabelText('Entrada'))

      expect(rotulosDoSelect('Categoria')).toEqual([
        '— sem categoria —',
        'Freela',
      ])

      fireEvent.click(screen.getByLabelText('Entrada'))
      const rotulos = rotulosDoSelect('Categoria')
      expect(rotulos.some((r) => r.includes('Quitacao'))).toBe(false)
      expect(rotulos.some((r) => r.includes('Transferencia'))).toBe(false)
    })

    // Sem isto o <select> renderiza vazio (o valor não casa com nenhuma
    // <option>) mas o ESTADO segue com o id velho, e o lançamento sairia
    // com uma categoria do tipo errado — em silêncio.
    it('trocar o "Entrada" limpa a categoria que não vale mais pro novo tipo', async () => {
      const fetchMock = mockRoutes()

      render(<NewEntryPage />)
      await waitFor(() =>
        expect(screen.getByLabelText('Categoria')).toBeInTheDocument(),
      )

      fireEvent.change(screen.getByLabelText('Categoria'), {
        target: { value: 'c-mercado' },
      })
      fireEvent.click(screen.getByLabelText('Entrada'))
      await waitFor(() =>
        expect(screen.getByLabelText('Categoria')).toHaveValue(''),
      )

      fireEvent.change(screen.getByLabelText('Descrição'), {
        target: { value: 'Freela' },
      })
      fireEvent.change(screen.getByLabelText('Valor'), {
        target: { value: '2.000,00' },
      })
      fireEvent.change(screen.getByLabelText('Data'), {
        target: { value: '2026-08-10' },
      })
      fireEvent.submit(screen.getByTestId('form-lancamento'))

      await waitFor(() => {
        const body = postBodyDe(fetchMock, '/api/transactions')
        expect(body.amount_cents).toBe(200000)
        expect('category_id' in body).toBe(false)
      })
    })

    // "— novo favorecido —": POST /api/payees ANTES do POST principal,
    // dentro do callback de mutação (mesmo padrão de DividasPage). O
    // `default_category_id` é o primeiro escritor real desse campo — é ele
    // que o import lê pra sugerir a categoria da próxima fatura.
    it('cria o favorecido inline, com a categoria escolhida como padrão dele', async () => {
      const fetchMock = mockRoutes()

      render(<NewEntryPage />)
      await waitFor(() =>
        expect(screen.getByLabelText('Favorecido')).toBeInTheDocument(),
      )

      fireEvent.change(screen.getByLabelText('Favorecido'), {
        target: { value: '__novo__' },
      })
      fireEvent.change(screen.getByLabelText('Nome do favorecido'), {
        target: { value: 'Mercado São Luiz' },
      })
      fireEvent.change(screen.getByLabelText('Categoria'), {
        target: { value: 'c-mercado' },
      })
      fireEvent.change(screen.getByLabelText('Descrição'), {
        target: { value: 'Compra do mês' },
      })
      fireEvent.change(screen.getByLabelText('Valor'), {
        target: { value: '350,00' },
      })
      fireEvent.change(screen.getByLabelText('Data'), {
        target: { value: '2026-08-10' },
      })
      fireEvent.submit(screen.getByTestId('form-lancamento'))

      await waitFor(() => {
        expect(postBodyDe(fetchMock, '/api/payees')).toEqual({
          name: 'Mercado São Luiz',
          kind: 'merchant',
          default_category_id: 'c-mercado',
        })
      })
      // O id devolvido pelo POST é o que vai no lançamento — nunca o
      // sentinel '__novo__'.
      await waitFor(() =>
        expect(postBodyDe(fetchMock, '/api/transactions').payee_id).toBe(
          'p-novo',
        ),
      )
    })

    it('"— novo favorecido —" sem nome: erro no cliente, NÃO chama a API', async () => {
      const fetchMock = mockRoutes()

      render(<NewEntryPage />)
      await waitFor(() =>
        expect(screen.getByLabelText('Favorecido')).toBeInTheDocument(),
      )

      fireEvent.change(screen.getByLabelText('Favorecido'), {
        target: { value: '__novo__' },
      })
      fireEvent.change(screen.getByLabelText('Descrição'), {
        target: { value: 'X' },
      })
      fireEvent.change(screen.getByLabelText('Valor'), {
        target: { value: '10,00' },
      })
      fireEvent.submit(screen.getByTestId('form-lancamento'))

      await waitFor(() =>
        expect(screen.getByRole('alert')).toHaveTextContent(
          'Informe o nome do favorecido',
        ),
      )
      expect(
        fetchMock.mock.calls.some(
          ([, init]) => (init as RequestInit)?.method === 'POST',
        ),
      ).toBe(false)
    })

    // POST 201 + o GET de recarga caindo: reenviar duplicaria dinheiro.
    it('lançamento gravado mas recarga falhou: diz que gravou, nunca que falhou', async () => {
      let gets = 0
      const fn = vi.fn(async (path: string, init?: RequestInit) => {
        if (init?.method === 'POST') {
          return {
            status: 201,
            json: async () => ({
              ok: true,
              data: { id: 'novo' },
              notifications: [],
            }),
          }
        }
        if (path.startsWith('/api/accounts')) {
          gets++
          // 1ª rodada = mount; a 2ª é o `carregar()` de depois do POST.
          if (gets >= 2) throw new TypeError('Failed to fetch')
          return {
            status: 200,
            json: async () => ({ ok: true, data: contas, notifications: [] }),
          }
        }
        if (path.startsWith('/api/recurring'))
          return {
            status: 200,
            json: async () => ({
              ok: true,
              data: recorrentes,
              notifications: [],
            }),
          }
        if (path.startsWith('/api/categories'))
          return {
            status: 200,
            json: async () => ({
              ok: true,
              data: categorias,
              notifications: [],
            }),
          }
        return {
          status: 200,
          json: async () => ({ ok: true, data: payees, notifications: [] }),
        }
      })
      vi.stubGlobal('fetch', fn)

      render(<NewEntryPage />)
      await waitFor(() =>
        expect(screen.getByLabelText('Categoria')).toBeInTheDocument(),
      )

      fireEvent.change(screen.getByLabelText('Descrição'), {
        target: { value: 'Almoço' },
      })
      fireEvent.change(screen.getByLabelText('Valor'), {
        target: { value: '32,00' },
      })
      fireEvent.change(screen.getByLabelText('Data'), {
        target: { value: '2026-08-10' },
      })
      fireEvent.submit(screen.getByTestId('form-lancamento'))

      const alerta = await screen.findByRole('alert')
      expect(alerta).toHaveTextContent(/O lançamento "Almoço" foi gravado/i)
      expect(alerta).toHaveTextContent(/não envie de novo/i)
      expect(alerta.textContent ?? '').not.toMatch(/falh/i)
    })
  })
})

describe('NewEntryPage — alvo de toque dos checkboxes', () => {
  it('a faixa do rótulo tem 44px — o alvo é a linha, não o quadradinho', async () => {
    // Mesma regra já aplicada em `#/reserva` e no filtro do extrato: o
    // `<label>` embrulha o `<input>` e é ele que recebe o toque.
    mockRoutes()
    render(<NewEntryPage />)
    const entrada = await screen.findByLabelText('Entrada')
    expect(entrada.closest('label')?.className).toContain('min-h-11')
  })
})
