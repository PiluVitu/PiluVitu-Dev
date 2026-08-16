import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError } from '../api'
import { DebtDetailPage, validateAllocations } from './debt-detail'

// Mockar `api` (não a rede) — mesmo padrão de config.test.tsx /
// BlocoComprometido.test.tsx: `api` já traduz envelope/erro; testar aqui
// prova o COMPONENTE, não o transporte HTTP (isso é `api.test.ts`).
vi.mock('../api', async (importOriginal) => {
  const real = await importOriginal<typeof import('../api')>()
  return { ...real, api: vi.fn() }
})

const items = [
  {
    item_id: 'i1',
    debt_id: 'd1',
    description: 'MacBook Air',
    amount_cents: 450000,
    allocated_cents: 450000,
    remaining_cents: 0,
    is_settled: 1,
  },
  {
    item_id: 'i2',
    debt_id: 'd1',
    description: 'Steam Deck',
    amount_cents: 280000,
    allocated_cents: 144000,
    remaining_cents: 136000,
    is_settled: 0,
  },
]

const detail = {
  debt: {
    id: 'd1',
    payee_id: 'p1',
    direction: 'i_owe',
    title: 'Pai',
    currency: 'BRL',
    opened_at: '2026-03-01',
    status: 'open',
    settled_at: null,
    notes: null,
    created_at: '2026-03-01T00:00:00Z',
    updated_at: '2026-03-01T00:00:00Z',
  },
  items,
  payments: [
    {
      id: 'pg1',
      debt_id: 'd1',
      paid_on: '2026-05-10',
      amount_cents: 294000,
      kind: 'cash',
      transaction_id: 'tx1',
      notes: null,
      created_at: '2026-05-10T00:00:00Z',
      allocations: [
        { item_id: 'i1', amount_cents: 150000 },
        { item_id: 'i2', amount_cents: 144000 },
      ],
    },
  ],
}

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
]

/**
 * Roteia `api()` mockado pelo par (método, path) — mesma ideia de
 * `mockRoutes`/`mockFetch` das outras telas, só que no nível de `api`, não
 * de `fetch` (pedido explícito da task: `api` já traduz envelope/erro, um
 * mock aqui prova o componente sem reimplementar o transporte HTTP). Os
 * campos aceitam uma função (chamada de novo a cada request) pra permitir
 * mutar o estado "servidor" entre a ação e o `carregar()` que a segue —
 * ex.: dar baixa muda `status`, e o teste quer ver o GET seguinte refletir
 * isso, não um snapshot congelado.
 */
function mockApi(
  opts: {
    detail?: () => unknown
    contas?: () => unknown
    post?: () => unknown
    writeOff?: () => unknown
    deleteDebt?: () => unknown
    deleteItem?: (itemId: string) => unknown
    deletePayment?: (paymentId: string) => unknown
  } = {},
) {
  vi.mocked(api).mockImplementation(
    async (path: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      if (method === 'GET' && path === '/api/accounts') {
        return opts.contas ? opts.contas() : contas
      }
      if (method === 'GET' && path === '/api/debts/d1') {
        return opts.detail ? opts.detail() : detail
      }
      if (method === 'POST' && path === '/api/debts/d1/payments') {
        return opts.post ? opts.post() : { payment: {}, transaction: null }
      }
      if (method === 'POST' && path === '/api/debts/d1/write-off') {
        return opts.writeOff ? opts.writeOff() : { id: 'd1', written_off: true }
      }
      if (method === 'DELETE' && path === '/api/debts/d1') {
        return opts.deleteDebt ? opts.deleteDebt() : { id: 'd1', deleted: true }
      }
      const itemMatch = /^\/api\/debts\/d1\/items\/(.+)$/.exec(path)
      if (method === 'DELETE' && itemMatch) {
        return opts.deleteItem
          ? opts.deleteItem(itemMatch[1])
          : { id: itemMatch[1], deleted: true }
      }
      const paymentMatch = /^\/api\/debts\/d1\/payments\/(.+)$/.exec(path)
      if (method === 'DELETE' && paymentMatch) {
        return opts.deletePayment
          ? opts.deletePayment(paymentMatch[1])
          : { id: paymentMatch[1], deleted: true }
      }
      throw new Error(`rota nao mockada: ${method} ${path}`)
    },
  )
}

afterEach(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
  window.location.hash = ''
})

describe('validateAllocations', () => {
  it('aceita alocacao que fecha exatamente no teto do item', () => {
    expect(
      validateAllocations({
        total_cents: 136000,
        items,
        alloc: { i2: 136000 },
      }),
    ).toBeNull()
  })

  it('recusa valor de pagamento zerado', () => {
    expect(validateAllocations({ total_cents: 0, items, alloc: {} })).toMatch(
      /maior que zero/,
    )
  })

  it('recusa soma de alocacoes acima do valor do pagamento', () => {
    expect(
      validateAllocations({ total_cents: 50000, items, alloc: { i2: 60000 } }),
    ).toMatch(/valor do pagamento/)
  })

  it('recusa alocacao acima do saldo do item', () => {
    expect(
      validateAllocations({
        total_cents: 300000,
        items,
        alloc: { i2: 200000 },
      }),
    ).toMatch(/Steam Deck/)
  })

  it('recusa alocacao em item ja quitado', () => {
    expect(
      validateAllocations({ total_cents: 10000, items, alloc: { i1: 10000 } }),
    ).toMatch(/MacBook Air/)
  })

  it('aceita alocacao parcial (sobra sem alocar)', () => {
    expect(
      validateAllocations({
        total_cents: 200000,
        items,
        alloc: { i2: 136000 },
      }),
    ).toBeNull()
  })
})

describe('DebtDetailPage', () => {
  it('nao lista conta credit_card no select de pagamento (o servidor sempre recusa)', async () => {
    const contasComCartao = [
      ...contas,
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
    mockApi({ contas: () => contasComCartao })

    render(<DebtDetailPage debtId="d1" />)
    await waitFor(() =>
      expect(screen.getByTestId('item-i2')).toBeInTheDocument(),
    )

    const formPagamento = within(screen.getByTestId('form-pagamento'))
    const select = formPagamento.getByLabelText('Conta') as HTMLSelectElement
    const opcoes = Array.from(select.options).map((o) => o.value)
    expect(opcoes).toEqual(['a1'])
    expect(opcoes).not.toContain('a2')
  })

  it('mostra itens com total/pago/falta e marca o quitado', async () => {
    mockApi()

    render(<DebtDetailPage debtId="d1" />)

    await waitFor(() =>
      expect(screen.getByTestId('item-i1')).toBeInTheDocument(),
    )

    const macbook = within(screen.getByTestId('item-i1'))
    expect(macbook.getByTestId('item-i1-total')).toHaveTextContent(
      'R$ 4.500,00',
    )
    expect(macbook.getByTestId('item-i1-pago')).toHaveTextContent('R$ 4.500,00')
    expect(macbook.getByTestId('item-i1-falta')).toHaveTextContent('R$ 0,00')
    expect(screen.getByTestId('item-i1')).toHaveClass('quitado')

    const steam = within(screen.getByTestId('item-i2'))
    expect(steam.getByTestId('item-i2-falta')).toHaveTextContent('R$ 1.360,00')
    expect(screen.getByTestId('item-i2')).not.toHaveClass('quitado')
  })

  it('lista pagamentos com a alocacao de cada um por item', async () => {
    mockApi()

    render(<DebtDetailPage debtId="d1" />)

    await waitFor(() =>
      expect(screen.getByTestId('pagamento-pg1')).toBeInTheDocument(),
    )

    const pg = within(screen.getByTestId('pagamento-pg1'))
    expect(pg.getByText('10/05/2026')).toBeInTheDocument()
    expect(pg.getByTestId('pagamento-pg1-total')).toHaveTextContent(
      'R$ 2.940,00',
    )
    expect(pg.getByTestId('alloc-pg1-i1')).toHaveTextContent('MacBook Air')
    expect(pg.getByTestId('alloc-pg1-i1')).toHaveTextContent('R$ 1.500,00')
    expect(pg.getByTestId('alloc-pg1-i2')).toHaveTextContent('R$ 1.440,00')
  })

  it('barra a superalocacao no cliente e NAO chama a API', async () => {
    mockApi()

    render(<DebtDetailPage debtId="d1" />)
    await waitFor(() =>
      expect(screen.getByTestId('item-i2')).toBeInTheDocument(),
    )
    vi.mocked(api).mockClear()

    // Escopado em form-pagamento: NovoItemForm (embaixo da tabela de itens)
    // também tem campos rotulados 'Valor'/'Data' — sem o within() aqui,
    // getByLabelText encontraria os dois e lançaria erro de múltiplos
    // elementos.
    const formPagamento = within(screen.getByTestId('form-pagamento'))
    fireEvent.change(formPagamento.getByLabelText('Valor'), {
      target: { value: '500,00' },
    })
    fireEvent.change(formPagamento.getByLabelText('Steam Deck'), {
      target: { value: '900,00' },
    })
    fireEvent.submit(screen.getByTestId('form-pagamento'))

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/valor do pagamento/),
    )
    expect(api).not.toHaveBeenCalled()
  })

  it('envia o pagamento dividido entre itens quando o guard passa', async () => {
    mockApi()

    render(<DebtDetailPage debtId="d1" />)
    await waitFor(() =>
      expect(screen.getByTestId('item-i2')).toBeInTheDocument(),
    )

    const formPagamento = within(screen.getByTestId('form-pagamento'))
    fireEvent.change(formPagamento.getByLabelText('Valor'), {
      target: { value: '1.360,00' },
    })
    fireEvent.change(formPagamento.getByLabelText('Data'), {
      target: { value: '2026-08-05' },
    })
    fireEvent.change(formPagamento.getByLabelText('Steam Deck'), {
      target: { value: '1.360,00' },
    })
    fireEvent.submit(screen.getByTestId('form-pagamento'))

    await waitFor(() => {
      expect(api).toHaveBeenCalledWith('/api/debts/d1/payments', {
        method: 'POST',
        body: JSON.stringify({
          paid_on: '2026-08-05',
          amount_cents: 136000,
          kind: 'cash',
          account_id: 'a1',
          description: 'Pgto divida — Pai',
          allocations: [{ item_id: 'i2', amount_cents: 136000 }],
        }),
      })
    })
  })

  it('sem Data preenchida no pagamento, usa o dia de Teresina (nao UTC) como default', async () => {
    // 01:00 UTC de 01/08 e 22h de 31/07 em Teresina (UTC-3). Fake so o Date
    // (nao os timers): waitFor usa setTimeout de verdade por baixo, e
    // travaria se o relogio inteiro estivesse congelado.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-08-01T01:00:00Z'))
    try {
      mockApi()

      render(<DebtDetailPage debtId="d1" />)
      await waitFor(() =>
        expect(screen.getByTestId('item-i2')).toBeInTheDocument(),
      )

      const formPagamento = within(screen.getByTestId('form-pagamento'))
      fireEvent.change(formPagamento.getByLabelText('Valor'), {
        target: { value: '1.360,00' },
      })
      fireEvent.change(formPagamento.getByLabelText('Steam Deck'), {
        target: { value: '1.360,00' },
      })
      fireEvent.submit(screen.getByTestId('form-pagamento'))

      await waitFor(() => {
        const call = vi
          .mocked(api)
          .mock.calls.find(([p]) => p === '/api/debts/d1/payments')
        expect(call).toBeDefined()
        expect(JSON.parse(call![1]!.body as string).paid_on).toBe('2026-07-31')
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it('mostra o OverAllocationError vindo da API mesmo com o guard do cliente ok', async () => {
    // O trigger do D1 é a verdade: o cliente pode estar com dado velho.
    mockApi({
      post: () => {
        throw new ApiError(
          409,
          'over_allocation',
          'alocacao excede o valor do item',
        )
      },
    })

    render(<DebtDetailPage debtId="d1" />)
    await waitFor(() =>
      expect(screen.getByTestId('item-i2')).toBeInTheDocument(),
    )

    const formPagamento = within(screen.getByTestId('form-pagamento'))
    fireEvent.change(formPagamento.getByLabelText('Valor'), {
      target: { value: '1.360,00' },
    })
    fireEvent.change(formPagamento.getByLabelText('Steam Deck'), {
      target: { value: '1.360,00' },
    })
    fireEvent.submit(screen.getByTestId('form-pagamento'))

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'O banco recusou: alocacao excede o valor do item. Nada foi gravado — recarregue a divida.',
      ),
    )
  })

  // ⚠️ É DINHEIRO: o 201 cria o pagamento E uma `transaction` real no caixa.
  // Antes, POST e GET moravam no mesmo `try` — um 201 seguido de um GET que
  // cai gravava o erro do GET em `formError`, e o formulário já tinha sido
  // limpo: o dono lia "falhou" com os campos vazios, reenviava, e ficava com
  // pagamento e lançamento de caixa DUPLICADOS.
  it('pagamento registrado mas recarga falhou: diz que registrou e avisa pra NÃO reenviar', async () => {
    let gets = 0
    mockApi({
      detail: () => {
        gets++
        // 1º GET = mount; o 2º é o `carregar()` de depois do POST.
        if (gets >= 2) {
          throw new ApiError(503, 'sem_conexao', 'sem conexão com o servidor')
        }
        return detail
      },
    })

    render(<DebtDetailPage debtId="d1" />)
    await waitFor(() =>
      expect(screen.getByTestId('item-i2')).toBeInTheDocument(),
    )

    const formPagamento = within(screen.getByTestId('form-pagamento'))
    fireEvent.change(formPagamento.getByLabelText('Valor'), {
      target: { value: '1.360,00' },
    })
    fireEvent.change(formPagamento.getByLabelText('Steam Deck'), {
      target: { value: '1.360,00' },
    })
    fireEvent.submit(screen.getByTestId('form-pagamento'))

    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveTextContent(/foi registrado/i)
    // O valor exato aparece na mensagem — é o que impede o dono de perder o
    // que digitou quando o formulário é limpo apesar da recarga ter caído.
    expect(alerta).toHaveTextContent(/R\$\s*1\.360,00/)
    expect(alerta).toHaveTextContent(/lançamento no caixa também/i)
    expect(alerta).toHaveTextContent(/não consegui recarregar/i)
    expect(alerta).toHaveTextContent(/não envie de novo/i)
    expect(alerta).toHaveTextContent(/duplicad/i)
    // NUNCA pode ler como falha da ação, nem vazar a mensagem do GET.
    expect(alerta.textContent ?? '').not.toMatch(/falh/i)
    expect(alerta.textContent ?? '').not.toMatch(/sem conexão/)

    // O POST em si aconteceu — é isso que torna a mensagem verdadeira.
    expect(
      vi
        .mocked(api)
        .mock.calls.some(([p, init]) =>
          p === '/api/debts/d1/payments'
            ? (init as RequestInit | undefined)?.method === 'POST'
            : false,
        ),
    ).toBe(true)
    // A tela continua de pé com o estado anterior — nada é derrubado.
    expect(screen.getByTestId('item-i2')).toBeInTheDocument()
  })

  it('descarta resposta obsoleta quando debtId muda antes dela chegar', async () => {
    // A troca de divida no App (App.tsx) so troca a prop debtId — nao
    // desmonta o componente. Uma resposta lenta da divida antiga chegando
    // DEPOIS da nova nao pode sobrescrever a tela que o usuario ja navegou.
    const detailD2 = {
      debt: { ...detail.debt, id: 'd2', title: 'Banco' },
      items: [
        {
          item_id: 'j1',
          debt_id: 'd2',
          description: 'Cadeira',
          amount_cents: 100000,
          allocated_cents: 0,
          remaining_cents: 100000,
          is_settled: 0,
        },
      ],
      payments: [],
    }

    let resolveD1: (value: unknown) => void = () => {}
    const d1Pending = new Promise((resolve) => {
      resolveD1 = resolve
    })

    vi.mocked(api).mockImplementation(
      async (path: string, init?: RequestInit) => {
        if (init?.method === 'POST') return { payment: {}, transaction: null }
        if (path === '/api/accounts') return contas
        if (path === '/api/debts/d1') return d1Pending
        if (path === '/api/debts/d2') return detailD2
        throw new Error(`rota nao mockada: ${path}`)
      },
    )

    const { rerender } = render(<DebtDetailPage debtId="d1" />)

    rerender(<DebtDetailPage debtId="d2" />)

    await waitFor(() =>
      expect(screen.getByTestId('item-j1')).toBeInTheDocument(),
    )

    // A resposta atrasada de d1 chega só agora — depois que a tela já
    // mostra d2. Sem a guarda de unmount/stale, isso reescreveria o estado.
    await act(async () => {
      resolveD1(detail)
      await new Promise((r) => setTimeout(r, 0))
    })

    expect(screen.queryByTestId('item-i1')).not.toBeInTheDocument()
    expect(screen.getByTestId('item-j1')).toBeInTheDocument()
  })

  // ---------------------------------------------------------------------
  // Task 5: ajuda contextual (§3.2 do spec) — os 3 pontos que vivem na
  // tela de detalhe de dívida: Itens, Dividir entre itens, Dar baixa.
  // ---------------------------------------------------------------------

  describe('ajuda contextual', () => {
    it('"Itens" abre no clique com o texto de que item é estoque, não lançamento', async () => {
      mockApi()
      const user = userEvent.setup()

      render(<DebtDetailPage debtId="d1" />)
      await waitFor(() =>
        expect(screen.getByTestId('item-i2')).toBeInTheDocument(),
      )

      await user.click(
        screen.getByRole('button', { name: 'Ajuda sobre Itens' }),
      )
      expect(
        await screen.findByText(/Não geram lançamento no caixa/),
      ).toBeInTheDocument()
    })

    it('"Dividir entre itens" abre no clique', async () => {
      mockApi()
      const user = userEvent.setup()

      render(<DebtDetailPage debtId="d1" />)
      await waitFor(() =>
        expect(screen.getByTestId('item-i2')).toBeInTheDocument(),
      )

      await user.click(
        screen.getByRole('button', { name: 'Ajuda sobre Dividir entre itens' }),
      )
      expect(await screen.findByText(/cobrir vários itens/)).toBeInTheDocument()
    })

    it('"Dar baixa" abre no clique — e some junto com o botão quando a dívida não está mais aberta', async () => {
      mockApi({
        detail: () => ({
          ...detail,
          debt: { ...detail.debt, status: 'settled' },
        }),
      })
      const user = userEvent.setup()

      render(<DebtDetailPage debtId="d1" />)
      await waitFor(() =>
        expect(screen.getByTestId('item-i2')).toBeInTheDocument(),
      )

      // status !== 'open': nem o botão nem a ajuda de "Dar baixa" aparecem
      // — a rota sempre devolveria 404 pra uma dívida já settled/baixada.
      expect(
        screen.queryByRole('button', { name: 'Dar baixa' }),
      ).not.toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: 'Ajuda sobre Dar baixa' }),
      ).not.toBeInTheDocument()
      expect(screen.getByText('Situação: Quitada')).toBeInTheDocument()
      // ⑤ A situação virou badge do design system — a frase INTEIRA fica
      // dentro dele (quebrar em "Situação:" + chip partiria o texto entre dois
      // elementos, e "Quitada" sozinha não diz de que é situação).
      expect(screen.getByText('Situação: Quitada')).toHaveClass('inline-flex')
    })

    it('"Dar baixa" (aberta): a ajuda abre no clique com o texto de que preserva histórico', async () => {
      mockApi()
      const user = userEvent.setup()

      render(<DebtDetailPage debtId="d1" />)
      await waitFor(() =>
        expect(screen.getByTestId('item-i2')).toBeInTheDocument(),
      )

      await user.click(
        screen.getByRole('button', { name: 'Ajuda sobre Dar baixa' }),
      )
      expect(
        await screen.findByText(/tira do comprometido/),
      ).toBeInTheDocument()
    })
  })

  // ---------------------------------------------------------------------
  // Task 5: estados vazios que explicam (§3.3 do spec) — dívida sem item.
  // ---------------------------------------------------------------------

  describe('estados vazios (dívida sem item)', () => {
    const detailVazio = { ...detail, items: [] }

    it('resumo do topo não mostra mais "R$ 0,00 de R$ 0,00"', async () => {
      mockApi({ detail: () => detailVazio })

      render(<DebtDetailPage debtId="d1" />)

      await waitFor(() =>
        expect(screen.getByText(/Sem itens ainda/)).toBeInTheDocument(),
      )
      expect(screen.queryByText(/devo/)).not.toBeInTheDocument()
    })

    it('card Itens explica que o total sai da soma dos itens, em vez de tabela vazia', async () => {
      mockApi({ detail: () => detailVazio })

      render(<DebtDetailPage debtId="d1" />)

      await waitFor(() =>
        expect(
          screen.getByText(/O total da dívida sai da soma dos itens/),
        ).toBeInTheDocument(),
      )
      expect(screen.queryByRole('table')).not.toBeInTheDocument()
    })

    it('"Dividir entre itens" explica em vez de renderizar bloco vazio', async () => {
      mockApi({ detail: () => detailVazio })

      render(<DebtDetailPage debtId="d1" />)

      await waitFor(() =>
        expect(
          screen.getByText(
            /A divisão aparece depois que existir pelo menos um item/,
          ),
        ).toBeInTheDocument(),
      )
    })
  })

  // ---------------------------------------------------------------------
  // Task 5: as quatro ações destrutivas — confirmação obrigatória via
  // `Dialog` do design system (trocado de `window.confirm` em revisão —
  // ver comentário de `ConfirmacaoPendente` em debt-detail.tsx), e o
  // caminho feliz de cada uma.
  //
  // Padrão de "cancelar": clicar no botão da ação, CONFIRMAR que o diálogo
  // abriu (`getByRole('heading', ...)` — um botão inerte falharia bem
  // AQUI, antes de qualquer coisa relacionada à API), só então clicar
  // "Cancelar" e afirmar que `api` nunca foi chamada. Essa ordem é o que
  // prova que a confirmação é o que impede a chamada, não uma coincidência
  // de mock.
  // ---------------------------------------------------------------------

  describe('excluir dívida', () => {
    it('cancelar a confirmação NÃO chama a API', async () => {
      mockApi()
      const user = userEvent.setup()

      render(<DebtDetailPage debtId="d1" />)
      await waitFor(() =>
        expect(screen.getByTestId('item-i2')).toBeInTheDocument(),
      )
      vi.mocked(api).mockClear()

      await user.click(screen.getByRole('button', { name: 'Excluir dívida' }))

      const dialogo = await screen.findByRole('heading', {
        name: 'Excluir dívida',
      })
      expect(dialogo).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'Cancelar' }))

      expect(
        screen.queryByRole('heading', { name: 'Excluir dívida' }),
      ).not.toBeInTheDocument()
      expect(api).not.toHaveBeenCalled()
    })

    it('confirmar chama DELETE e navega pra #/dividas', async () => {
      mockApi()
      const user = userEvent.setup()

      render(<DebtDetailPage debtId="d1" />)
      await waitFor(() =>
        expect(screen.getByTestId('item-i2')).toBeInTheDocument(),
      )

      await user.click(screen.getByRole('button', { name: 'Excluir dívida' }))
      await screen.findByRole('heading', { name: 'Excluir dívida' })
      await user.click(screen.getByRole('button', { name: 'Confirmar' }))

      await waitFor(() =>
        expect(api).toHaveBeenCalledWith('/api/debts/d1', {
          method: 'DELETE',
        }),
      )
      expect(window.location.hash).toBe('#/dividas')
    })

    it('recusada por debt_has_ledger: mostra a mensagem do SERVIDOR (cita "Dar baixa"), sem reescrever', async () => {
      const MENSAGEM_SERVIDOR =
        "Esta dívida já tem pagamento em dinheiro registrado no caixa. Excluir apagaria a dívida e deixaria o lançamento sem explicação. Use 'Dar baixa' para encerrá-la preservando o histórico, ou exclua os pagamentos primeiro."
      mockApi({
        deleteDebt: () => {
          throw new ApiError(422, 'debt_has_ledger', MENSAGEM_SERVIDOR)
        },
      })
      const user = userEvent.setup()

      render(<DebtDetailPage debtId="d1" />)
      await waitFor(() =>
        expect(screen.getByTestId('item-i2')).toBeInTheDocument(),
      )

      await user.click(screen.getByRole('button', { name: 'Excluir dívida' }))
      await screen.findByRole('heading', { name: 'Excluir dívida' })
      await user.click(screen.getByRole('button', { name: 'Confirmar' }))

      await waitFor(() =>
        expect(screen.getByRole('alert')).toHaveTextContent(MENSAGEM_SERVIDOR),
      )
      // A prova específica que o brief pede: a frase que ensina a saída
      // ("Dar baixa") sobrevive intacta — não um 422 genérico reescrito.
      expect(screen.getByRole('alert')).toHaveTextContent('Dar baixa')
      expect(window.location.hash).toBe('')
    })
  })

  describe('dar baixa', () => {
    it('cancelar a confirmação NÃO chama a API', async () => {
      mockApi()
      const user = userEvent.setup()

      render(<DebtDetailPage debtId="d1" />)
      await waitFor(() =>
        expect(screen.getByTestId('item-i2')).toBeInTheDocument(),
      )
      vi.mocked(api).mockClear()

      await user.click(screen.getByRole('button', { name: 'Dar baixa' }))

      expect(
        await screen.findByRole('heading', { name: 'Dar baixa' }),
      ).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'Cancelar' }))

      expect(
        screen.queryByRole('heading', { name: 'Dar baixa' }),
      ).not.toBeInTheDocument()
      expect(api).not.toHaveBeenCalled()
    })

    it('confirmar chama POST /write-off e recarrega — situação passa a Baixada, botão some', async () => {
      let status: 'open' | 'written_off' = 'open'
      mockApi({
        detail: () => ({ ...detail, debt: { ...detail.debt, status } }),
        writeOff: () => {
          status = 'written_off'
          return { id: 'd1', written_off: true }
        },
      })
      const user = userEvent.setup()

      render(<DebtDetailPage debtId="d1" />)
      await waitFor(() =>
        expect(screen.getByTestId('item-i2')).toBeInTheDocument(),
      )

      await user.click(screen.getByRole('button', { name: 'Dar baixa' }))
      await screen.findByRole('heading', { name: 'Dar baixa' })
      await user.click(screen.getByRole('button', { name: 'Confirmar' }))

      await waitFor(() =>
        expect(screen.getByText('Situação: Baixada')).toBeInTheDocument(),
      )
      expect(
        screen.queryByRole('button', { name: 'Dar baixa' }),
      ).not.toBeInTheDocument()
      expect(api).toHaveBeenCalledWith('/api/debts/d1/write-off', {
        method: 'POST',
      })
    })

    it('erro do servidor aparece em role="alert"', async () => {
      mockApi({
        writeOff: () => {
          throw new ApiError(
            404,
            'not_found',
            'não encontrada, já quitada ou já baixada',
          )
        },
      })
      const user = userEvent.setup()

      render(<DebtDetailPage debtId="d1" />)
      await waitFor(() =>
        expect(screen.getByTestId('item-i2')).toBeInTheDocument(),
      )

      await user.click(screen.getByRole('button', { name: 'Dar baixa' }))
      await screen.findByRole('heading', { name: 'Dar baixa' })
      await user.click(screen.getByRole('button', { name: 'Confirmar' }))

      await waitFor(() =>
        expect(screen.getByRole('alert')).toHaveTextContent(
          'não encontrada, já quitada ou já baixada',
        ),
      )
    })

    // Fix de revisão: a mutação e o recarregamento pós-mutação são
    // sucessos/falhas INDEPENDENTES — um GET que falha depois de um POST
    // bem-sucedido não pode fazer a tela dizer "deu errado" quando na
    // verdade a baixa aconteceu. Prova: `writeOff` sempre tem sucesso;
    // `detail` (usado tanto no mount quanto no `carregar()` pós-baixa)
    // funciona na 1ª chamada e falha a partir da 2ª (a do reload).
    it('sucesso na baixa mas falha ao RECARREGAR não diz que a ação falhou', async () => {
      let chamadasDetail = 0
      mockApi({
        detail: () => {
          chamadasDetail += 1
          if (chamadasDetail === 1) return detail
          throw new ApiError(
            503,
            'auth_unavailable',
            'sem conexão com o servidor',
          )
        },
        writeOff: () => ({ id: 'd1', written_off: true }),
      })
      const user = userEvent.setup()

      render(<DebtDetailPage debtId="d1" />)
      await waitFor(() =>
        expect(screen.getByTestId('item-i2')).toBeInTheDocument(),
      )

      await user.click(screen.getByRole('button', { name: 'Dar baixa' }))
      await screen.findByRole('heading', { name: 'Dar baixa' })
      await user.click(screen.getByRole('button', { name: 'Confirmar' }))

      expect(api).toHaveBeenCalledWith('/api/debts/d1/write-off', {
        method: 'POST',
      })
      await waitFor(() =>
        expect(screen.getByRole('alert')).toHaveTextContent(
          'A ação foi concluída, mas não consegui recarregar',
        ),
      )
      // NÃO é a mensagem do GET (503) reaproveitada como se fosse erro da
      // baixa — as duas são coisas diferentes, e só uma delas é verdade.
      expect(screen.getByRole('alert')).not.toHaveTextContent('sem conexão')
    })
  })

  describe('excluir item (por linha)', () => {
    it('cancelar a confirmação NÃO chama a API', async () => {
      mockApi()
      const user = userEvent.setup()

      render(<DebtDetailPage debtId="d1" />)
      await waitFor(() =>
        expect(screen.getByTestId('item-i2')).toBeInTheDocument(),
      )
      vi.mocked(api).mockClear()

      await user.click(screen.getByTestId('excluir-item-i2'))

      const dialogo = await screen.findByRole('dialog')
      expect(
        within(dialogo).getByRole('heading', { name: 'Excluir item' }),
      ).toBeInTheDocument()
      // "Steam Deck" também aparece na tabela por baixo — escopado no
      // diálogo pra não colidir com getByText ambíguo.
      expect(within(dialogo).getByText(/Steam Deck/)).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'Cancelar' }))

      expect(
        screen.queryByRole('heading', { name: 'Excluir item' }),
      ).not.toBeInTheDocument()
      expect(api).not.toHaveBeenCalled()
    })

    it('confirmar chama DELETE do item e recarrega sem ele', async () => {
      let itemsAtuais = items
      mockApi({
        detail: () => ({ ...detail, items: itemsAtuais }),
        deleteItem: (itemId) => {
          itemsAtuais = itemsAtuais.filter((i) => i.item_id !== itemId)
          return { id: itemId, deleted: true }
        },
      })
      const user = userEvent.setup()

      render(<DebtDetailPage debtId="d1" />)
      await waitFor(() =>
        expect(screen.getByTestId('item-i2')).toBeInTheDocument(),
      )

      await user.click(screen.getByTestId('excluir-item-i2'))
      await screen.findByRole('heading', { name: 'Excluir item' })
      await user.click(screen.getByRole('button', { name: 'Confirmar' }))

      await waitFor(() =>
        expect(screen.queryByTestId('item-i2')).not.toBeInTheDocument(),
      )
      expect(screen.getByTestId('item-i1')).toBeInTheDocument()
      expect(api).toHaveBeenCalledWith('/api/debts/d1/items/i2', {
        method: 'DELETE',
      })
    })

    it('recusado (item alocado) mostra a mensagem cozida da API, sem SQLITE cru', async () => {
      mockApi({
        deleteItem: () => {
          throw new ApiError(
            422,
            'constraint_violation',
            'Referência inválida: este item tem pagamento alocado — remova o pagamento primeiro.',
          )
        },
      })
      const user = userEvent.setup()

      render(<DebtDetailPage debtId="d1" />)
      await waitFor(() =>
        expect(screen.getByTestId('item-i2')).toBeInTheDocument(),
      )

      await user.click(screen.getByTestId('excluir-item-i2'))
      await screen.findByRole('heading', { name: 'Excluir item' })
      await user.click(screen.getByRole('button', { name: 'Confirmar' }))

      await waitFor(() =>
        expect(screen.getByRole('alert')).toHaveTextContent(
          'remova o pagamento primeiro',
        ),
      )
      expect(screen.getByRole('alert')).not.toHaveTextContent(/SQLITE/)
      // O item continua na tela — a exclusão não teve efeito nenhum.
      expect(screen.getByTestId('item-i2')).toBeInTheDocument()
    })
  })

  describe('excluir pagamento (por linha)', () => {
    it('cancelar a confirmação NÃO chama a API', async () => {
      mockApi()
      const user = userEvent.setup()

      render(<DebtDetailPage debtId="d1" />)
      await waitFor(() =>
        expect(screen.getByTestId('pagamento-pg1')).toBeInTheDocument(),
      )
      vi.mocked(api).mockClear()

      await user.click(screen.getByTestId('excluir-pagamento-pg1'))

      const dialogo = await screen.findByRole('dialog')
      expect(
        within(dialogo).getByRole('heading', { name: 'Excluir pagamento' }),
      ).toBeInTheDocument()
      // O valor também aparece na lista de pagamentos por baixo —
      // escopado no diálogo pra não colidir com getByText ambíguo.
      expect(within(dialogo).getByText(/R\$ 2\.940,00/)).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'Cancelar' }))

      expect(
        screen.queryByRole('heading', { name: 'Excluir pagamento' }),
      ).not.toBeInTheDocument()
      expect(api).not.toHaveBeenCalled()
    })

    it('confirmar chama DELETE do pagamento e recarrega sem ele', async () => {
      let paymentsAtuais = detail.payments
      mockApi({
        detail: () => ({ ...detail, payments: paymentsAtuais }),
        deletePayment: (paymentId) => {
          paymentsAtuais = paymentsAtuais.filter((p) => p.id !== paymentId)
          return { id: paymentId, deleted: true }
        },
      })
      const user = userEvent.setup()

      render(<DebtDetailPage debtId="d1" />)
      await waitFor(() =>
        expect(screen.getByTestId('pagamento-pg1')).toBeInTheDocument(),
      )

      await user.click(screen.getByTestId('excluir-pagamento-pg1'))
      await screen.findByRole('heading', { name: 'Excluir pagamento' })
      await user.click(screen.getByRole('button', { name: 'Confirmar' }))

      await waitFor(() =>
        expect(screen.queryByTestId('pagamento-pg1')).not.toBeInTheDocument(),
      )
      expect(api).toHaveBeenCalledWith('/api/debts/d1/payments/pg1', {
        method: 'DELETE',
      })
    })
  })

  // ---------------------------------------------------------------------
  // Task 5: estado vazio do card Pagamentos (fix de revisão — §3.3 do
  // spec cobriu Itens/Dividir entre itens, mas deixou este card em
  // branco quando não há pagamento nenhum ainda).
  // ---------------------------------------------------------------------

  it('card Pagamentos sem nenhum pagamento explica em vez de ficar em branco', async () => {
    mockApi({ detail: () => ({ ...detail, payments: [] }) })

    render(<DebtDetailPage debtId="d1" />)

    await waitFor(() =>
      expect(screen.getByText(/Nenhum pagamento ainda/)).toBeInTheDocument(),
    )
    expect(screen.queryByTestId('pagamento-pg1')).not.toBeInTheDocument()
  })

  // ③ Três colunas de dinheiro por item + o total de cada pagamento.
  it('as colunas de dinheiro (item e pagamento) usam tabular-nums', async () => {
    mockApi()

    render(<DebtDetailPage debtId="d1" />)

    await waitFor(() =>
      expect(screen.getByTestId('item-i1')).toBeInTheDocument(),
    )

    expect(screen.getByTestId('item-i1-total')).toHaveClass('tabular-nums')
    expect(screen.getByTestId('item-i1-pago')).toHaveClass('tabular-nums')
    expect(screen.getByTestId('item-i1-falta')).toHaveClass('tabular-nums')
    expect(screen.getByTestId('pagamento-pg1-total')).toHaveClass(
      'tabular-nums',
    )
  })
})
