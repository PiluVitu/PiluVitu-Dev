import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import type { AccountView } from '../pages/accounts'
import type { BillPaymentView } from './PagamentosFeitos'
import { PagarFatura, type OpenBillView } from './PagarFatura'

/**
 * ⚠️ Relógio FIXO no arquivo inteiro: `2026-09-06T01:00:00Z` são **22h de
 * 05/09 em Teresina**. É a janela em que UTC e Teresina discordam de DIA, e
 * sem ela a asserção sobre a data default passaria mesmo com
 * `new Date().toISOString().slice(0,10)` no lugar de `todayInTeresina()` —
 * o teste não mataria a mutação que importa.
 *
 * `toFake: ['Date']` e não `useFakeTimers()` puro: `waitFor`/`userEvent`
 * dependem de `setTimeout` REAL por baixo e param se ele for falsificado
 * (mesma pegadinha já registrada em `pages/transferir.test.tsx`).
 */
beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-06T01:00:00Z'))
})

afterAll(() => {
  vi.useRealTimers()
})

const CARTAO: AccountView = {
  id: 'card1',
  name: 'Nubank cartao',
  scope: 'PF',
  kind: 'credit_card',
  closing_day: 25,
  due_day: 5,
  balance_cents: -184790,
}

const CONTAS: AccountView[] = [
  {
    id: 'a1',
    name: 'Nubank PF',
    scope: 'PF',
    kind: 'checking',
    closing_day: null,
    due_day: null,
    balance_cents: 234012,
  },
  CARTAO,
  {
    id: 'a3',
    name: 'Inter PJ',
    scope: 'PJ',
    kind: 'checking',
    closing_day: null,
    due_day: null,
    balance_cents: 412000,
  },
]

/** Uma fatura de 40 linhas — o N que o dono precisa ver antes de tocar. */
const FATURA: OpenBillView = {
  competence: '2026-08',
  amount_cents: 184790,
  line_count: 40,
}

/** Um pagamento registrado (`GET /api/bills/payments`), valores fictícios. */
const PAGAMENTO: BillPaymentView = {
  transfer_id: 'tr1',
  competence: '2026-08',
  paid_on: '2026-09-05',
  amount_cents: 184790,
  line_count: 40,
  from_account_id: 'a1',
  from_account_name: 'Nubank PF',
}

function envelope(data: unknown) {
  return {
    status: 200,
    json: async () => ({ ok: true, data, notifications: [] }),
  }
}

function mockApi(
  opts: {
    bills?: OpenBillView[]
    pay?: { status: number; body: unknown }
    /** Faz o GET de /api/bills rejeitar a partir da N-ésima chamada. */
    getFalhaApartirDe?: number
    /** Respostas sucessivas de GET /api/bills/payments (a última se repete). */
    pagamentos?: BillPaymentView[][]
    pagamentosFalham?: boolean
    undo?: { status: number; body: unknown }
  } = {},
) {
  let getCount = 0
  let pagamentosCount = 0
  const fn = vi.fn(async (path: string, init?: RequestInit) => {
    // Rotas do desfazer roteadas por PATH e FORA de `getCount`: o
    // `getFalhaApartirDe` dos testes de pagar conta só as leituras da fatura.
    if (path.startsWith('/api/bills/payments/')) {
      const undo = opts.undo ?? {
        status: 200,
        body: {
          ok: true,
          data: {
            transfer_id: 'tr1',
            competence: '2026-08',
            amount_cents: 184790,
            unsettled_count: 40,
          },
          notifications: [],
        },
      }
      return { status: undo.status, json: async () => undo.body }
    }
    if (path.startsWith('/api/bills/payments')) {
      if (opts.pagamentosFalham) throw new TypeError('Failed to fetch')
      const respostas = opts.pagamentos ?? [[]]
      const data =
        respostas[Math.min(pagamentosCount, respostas.length - 1)] ?? []
      pagamentosCount++
      return envelope(data)
    }
    if (init?.method === 'POST') {
      const pay = opts.pay ?? {
        status: 201,
        body: {
          ok: true,
          data: { settled_count: 40, amount_cents: 184790 },
          notifications: [],
        },
      }
      return { status: pay.status, json: async () => pay.body }
    }
    getCount++
    if (
      opts.getFalhaApartirDe !== undefined &&
      getCount >= opts.getFalhaApartirDe
    ) {
      // Rede caindo de verdade: `fetch` REJEITA, não devolve envelope de
      // erro — é o modo de falha do Android do dono num sinal ruim.
      throw new TypeError('Failed to fetch')
    }
    return {
      status: 200,
      json: async () => ({
        ok: true,
        data: opts.bills ?? [FATURA],
        notifications: [],
      }),
    }
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

afterEach(() => {
  vi.unstubAllGlobals()
})

function montar(props: Partial<Parameters<typeof PagarFatura>[0]> = {}) {
  const recarregarContas = vi.fn().mockResolvedValue(undefined)
  render(
    <PagarFatura
      cartao={CARTAO}
      contas={CONTAS}
      recarregarContas={recarregarContas}
      {...props}
    />,
  )
  return { recarregarContas }
}

/** Abre o painel e espera a fatura chegar. */
async function abrir(usuario: ReturnType<typeof userEvent.setup>) {
  await usuario.click(screen.getByTestId('pagar-fatura-card1'))
  await waitFor(() =>
    expect(screen.getByTestId('painel-pagar-fatura')).toBeInTheDocument(),
  )
}

function corpoDoPost(fetchMock: ReturnType<typeof mockApi>) {
  const post = fetchMock.mock.calls.find(
    ([, init]) => (init as RequestInit)?.method === 'POST',
  )
  return JSON.parse((post![1] as RequestInit).body as string) as Record<
    string,
    unknown
  >
}

describe('PagarFatura', () => {
  it('nao busca fatura nenhuma antes de o painel abrir', () => {
    const fetchMock = mockApi()
    montar()

    // A lista de contas tem N cartões: buscar a fatura de todos no mount
    // cobraria N requisições por uma tela aberta uma vez por mês.
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('mostra competencia, total e QUANTAS linhas serao liquidadas', async () => {
    const usuario = userEvent.setup()
    mockApi()
    montar()
    await abrir(usuario)

    await waitFor(() =>
      expect(screen.getByTestId('fatura-total')).toBeInTheDocument(),
    )

    const card = within(screen.getByTestId('fatura-total'))
    expect(card.getByText('Fatura de ago/26')).toBeInTheDocument()
    expect(screen.getByTestId('fatura-total-valor')).toHaveTextContent(
      'R$ 1.847,90',
    )
    // ⚠️ O N é o número da operação: o dono vai mexer em 40 lançamentos de
    // uma vez. Vem do servidor (`line_count`), nunca do tamanho de uma
    // página do extrato.
    expect(screen.getByTestId('fatura-linhas')).toHaveTextContent(
      '40 lançamentos serão liquidados',
    )
  })

  it('a data do pagamento nasce HOJE em Teresina, nao em UTC', async () => {
    const usuario = userEvent.setup()
    mockApi()
    montar()
    await abrir(usuario)

    // 22h de 05/09 em Teresina já é 06/09 em UTC. O default tem que ser 05.
    expect(screen.getByTestId('fatura-data')).toHaveValue('2026-09-05')
  })

  it('a conta de origem mostra o SALDO junto, e cartao nao entra na lista', async () => {
    const usuario = userEvent.setup()
    mockApi()
    montar()
    await abrir(usuario)

    const origem = screen.getByTestId('fatura-origem')
    // Escolher de onde o dinheiro sai sem ver quanto tem lá é decidir às
    // cegas — achado da revisão de `transferir.tsx`.
    expect(
      within(origem).getByRole('option', { name: 'Nubank PF · R$ 2.340,12' }),
    ).toBeInTheDocument()
    expect(
      within(origem).getByRole('option', { name: 'Inter PJ · R$ 4.120,00' }),
    ).toBeInTheDocument()
    // Pagar cartão com cartão é o que `payBill` recusa com `invalid_account`.
    expect(
      within(origem).queryByRole('option', { name: /Nubank cartao/ }),
    ).not.toBeInTheDocument()
  })

  it('saldo que COBRE a fatura nao gera aviso nenhum', async () => {
    const usuario = userEvent.setup()
    mockApi()
    montar()
    await abrir(usuario)

    // Nubank PF tem R$ 2.340,12 e a fatura é R$ 1.847,90: cobre.
    await usuario.selectOptions(screen.getByTestId('fatura-origem'), 'a1')
    expect(screen.queryByTestId('saldo-nao-cobre')).not.toBeInTheDocument()
  })

  it('avisa quando o saldo da origem NAO cobre a fatura — sem bloquear o pagamento', async () => {
    const usuario = userEvent.setup()
    mockApi()
    const magra: AccountView = { ...CONTAS[0], balance_cents: 10000 }
    montar({ contas: [magra, CARTAO] })
    await abrir(usuario)

    await usuario.selectOptions(screen.getByTestId('fatura-origem'), 'a1')

    expect(screen.getByTestId('saldo-nao-cobre')).toHaveTextContent(
      /não cobre esta fatura/,
    )
    // ⚠️ AVISO, nunca bloqueio: o servidor aceita e a conta fica negativa —
    // gastar mais do que se tem é decisão do dono, mas ele precisa VER antes.
    expect(screen.getByTestId('revisar-pagamento')).not.toBeDisabled()
  })

  it('recusa avancar sem conta de origem — sem abrir o dialogo nem gastar POST', async () => {
    const usuario = userEvent.setup()
    const fetchMock = mockApi()
    montar()
    await abrir(usuario)

    await usuario.click(screen.getByTestId('revisar-pagamento'))

    expect(screen.getByTestId('fatura-erro')).toHaveTextContent(
      'Escolha a conta de onde o dinheiro sai.',
    )
    expect(screen.queryByTestId('confirmar-pagamento')).not.toBeInTheDocument()
    expect(
      fetchMock.mock.calls.some(
        ([, init]) => (init as RequestInit)?.method === 'POST',
      ),
    ).toBe(false)
  })

  it('recusa data vazia — o <input type=date> limpo do Android', async () => {
    const usuario = userEvent.setup()
    const fetchMock = mockApi()
    montar()
    await abrir(usuario)

    await usuario.selectOptions(screen.getByTestId('fatura-origem'), 'a1')
    await usuario.clear(screen.getByTestId('fatura-data'))
    await usuario.click(screen.getByTestId('revisar-pagamento'))

    expect(screen.getByTestId('fatura-erro')).toHaveTextContent(
      /Informe a data do pagamento/,
    )
    expect(screen.queryByTestId('confirmar-pagamento')).not.toBeInTheDocument()
    expect(
      fetchMock.mock.calls.some(
        ([, init]) => (init as RequestInit)?.method === 'POST',
      ),
    ).toBe(false)
  })

  it('o dialogo diz que LIQUIDA N lancamentos E move o dinheiro, e onde se desfaz', async () => {
    const usuario = userEvent.setup()
    mockApi()
    montar()
    await abrir(usuario)
    await usuario.selectOptions(screen.getByTestId('fatura-origem'), 'a1')
    await usuario.click(screen.getByTestId('revisar-pagamento'))

    const dialogo = within(await screen.findByTestId('confirmar-pagamento'))
    expect(dialogo.getByText(/Pagar a fatura de ago\/26\?/)).toBeInTheDocument()
    // As DUAS metades: só uma seria mentira por omissão.
    const descricao = dialogo.getByText(/Isto liquida/)
    expect(descricao).toHaveTextContent('liquida 40 lançamentos')
    expect(descricao).toHaveTextContent('move R$ 1.847,90')
    expect(descricao).toHaveTextContent('de "Nubank PF" para "Nubank cartao"')
    // Desde o registro do pagamento (migration 0020) existe desfazer em lote,
    // e o texto antigo ("não há como desfazer") passaria a ser mentira.
    expect(descricao).not.toHaveTextContent('Não há como desfazer')
    expect(descricao).toHaveTextContent(
      'Dá para desfazer depois, em "Pagamentos feitos" neste painel',
    )
  })

  /**
   * ⚠️ Regressão de um defeito MEDIDO em Chrome real com toque de verdade, que
   * este ambiente NÃO consegue reproduzir: fechar o diálogo dentro do handler
   * do toque desmontava a camada de cima no meio do gesto, e o `click` que vem
   * depois do `pointerup` caía no overlay do `Sheet` atrás, fechando o painel
   * inteiro — o `422` do servidor virava "o painel sumiu", sem erro nenhum.
   *
   * jsdom não faz hit testing, então o click-through é invisível aqui. O que
   * este teste trava é a PROPRIEDADE que corrigiu o defeito e que jsdom
   * consegue observar: enquanto a resposta não chega, o diálogo continua
   * aberto — ou seja, `setConfirmando(false)` não roda dentro do gesto.
   */
  it('o dialogo so fecha DEPOIS da resposta, nunca dentro do gesto', async () => {
    const usuario = userEvent.setup()
    let responder: () => void = () => {}
    const emVoo = new Promise<void>((r) => {
      responder = r
    })

    vi.stubGlobal(
      'fetch',
      vi.fn(async (path: string, init?: RequestInit) => {
        if (init?.method === 'POST') {
          await emVoo
          return {
            status: 201,
            json: async () => ({ ok: true, data: {}, notifications: [] }),
          }
        }
        if (path.startsWith('/api/bills/payments')) return envelope([])
        return {
          status: 200,
          json: async () => ({ ok: true, data: [FATURA], notifications: [] }),
        }
      }),
    )

    montar()
    await abrir(usuario)
    await usuario.selectOptions(screen.getByTestId('fatura-origem'), 'a1')
    await usuario.click(screen.getByTestId('revisar-pagamento'))
    await screen.findByTestId('confirmar-pagamento')
    await usuario.click(screen.getByTestId('confirmar-pagamento-botao'))

    // Com o POST ainda em voo: diálogo de pé, botão inerte e dizendo o estado.
    await waitFor(() =>
      expect(screen.getByTestId('confirmar-pagamento-botao')).toBeDisabled(),
    )
    expect(screen.getByTestId('confirmar-pagamento')).toBeInTheDocument()
    expect(screen.getByTestId('confirmar-pagamento-botao')).toHaveTextContent(
      'Pagando…',
    )
    // Cancelar também não escapa no meio: o dinheiro está sendo movido.
    expect(screen.getByTestId('cancelar-pagamento')).toBeDisabled()

    responder()

    // Só agora as duas camadas somem.
    await waitFor(() =>
      expect(
        screen.queryByTestId('confirmar-pagamento'),
      ).not.toBeInTheDocument(),
    )
    await waitFor(() =>
      expect(
        screen.queryByTestId('painel-pagar-fatura'),
      ).not.toBeInTheDocument(),
    )
  })

  it('cancelar no dialogo nao paga nada', async () => {
    const usuario = userEvent.setup()
    const fetchMock = mockApi()
    montar()
    await abrir(usuario)
    await usuario.selectOptions(screen.getByTestId('fatura-origem'), 'a1')
    await usuario.click(screen.getByTestId('revisar-pagamento'))

    await screen.findByTestId('confirmar-pagamento')
    await usuario.click(screen.getByTestId('cancelar-pagamento'))

    await waitFor(() =>
      expect(
        screen.queryByTestId('confirmar-pagamento'),
      ).not.toBeInTheDocument(),
    )
    expect(
      fetchMock.mock.calls.some(
        ([, init]) => (init as RequestInit)?.method === 'POST',
      ),
    ).toBe(false)
  })

  it('confirmar posta a fatura com expected_amount_cents e a data escolhida', async () => {
    const usuario = userEvent.setup()
    const fetchMock = mockApi()
    const { recarregarContas } = montar()
    await abrir(usuario)
    await usuario.selectOptions(screen.getByTestId('fatura-origem'), 'a1')
    await usuario.click(screen.getByTestId('revisar-pagamento'))
    await screen.findByTestId('confirmar-pagamento')
    await usuario.click(screen.getByTestId('confirmar-pagamento-botao'))

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([, init]) => (init as RequestInit)?.method === 'POST',
        ),
      ).toBe(true),
    )

    const post = fetchMock.mock.calls.find(
      ([, init]) => (init as RequestInit)?.method === 'POST',
    )
    expect(post![0]).toBe('/api/bills/pay')
    expect(corpoDoPost(fetchMock)).toEqual({
      card_account_id: 'card1',
      competence: '2026-08',
      from_account_id: 'a1',
      paid_on: '2026-09-05',
      // ⚠️ CONFIRMAÇÃO do total lido, nunca valor parcial: uma compra
      // importada entre a renderização e o toque vira `amount_mismatch` no
      // servidor em vez de um pagamento pelo número errado.
      expected_amount_cents: 184790,
    })

    // Os DOIS saldos mudam (corrente e cartão): a lista de contas recarrega.
    await waitFor(() => expect(recarregarContas).toHaveBeenCalled())
    // Deu certo => o painel fecha.
    await waitFor(() =>
      expect(
        screen.queryByTestId('painel-pagar-fatura'),
      ).not.toBeInTheDocument(),
    )
  })

  it('a recusa do servidor aparece em role=alert e ROLA ate a vista', async () => {
    const usuario = userEvent.setup()
    const scrollIntoView = vi.fn()
    const original = Element.prototype.scrollIntoView
    Element.prototype.scrollIntoView = scrollIntoView

    try {
      mockApi({
        pay: {
          status: 422,
          body: {
            ok: false,
            data: null,
            notifications: [
              {
                type: 'error',
                code: 'invalid_bill',
                field: 'already_paid',
                message:
                  'a fatura de 2026-08 já está paga: todas as linhas dessa competência já foram liquidadas',
              },
            ],
          },
        },
      })
      montar()
      await abrir(usuario)
      await usuario.selectOptions(screen.getByTestId('fatura-origem'), 'a1')
      await usuario.click(screen.getByTestId('revisar-pagamento'))
      await screen.findByTestId('confirmar-pagamento')
      await usuario.click(screen.getByTestId('confirmar-pagamento-botao'))

      const alerta = await screen.findByRole('alert')
      // A mensagem do servidor chega crua, sem tradução que a suavize.
      expect(alerta).toHaveTextContent('já está paga')
      // ⚠️ Uma recusa fora do viewport não existe pro dono: `nearest` rola o
      // mínimo e é no-op quando já está visível.
      expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' })
      // O painel continua de pé — ele não perdeu o que tinha conferido.
      expect(screen.getByTestId('painel-pagar-fatura')).toBeInTheDocument()
    } finally {
      Element.prototype.scrollIntoView = original
    }
  })

  it('recarga falhou: diz que FOI PAGA, proibe reenviar nomeando a duplicata, e TRAVA o botao', async () => {
    const usuario = userEvent.setup()
    // 1ª chamada (abertura) passa; a 2ª (recarga pós-pagamento) cai.
    mockApi({ getFalhaApartirDe: 2 })
    montar()
    await abrir(usuario)
    await usuario.selectOptions(screen.getByTestId('fatura-origem'), 'a1')
    await usuario.click(screen.getByTestId('revisar-pagamento'))
    await screen.findByTestId('confirmar-pagamento')
    await usuario.click(screen.getByTestId('confirmar-pagamento-botao'))

    const alerta = await screen.findByRole('alert')
    // ⚠️ NUNCA pode ler como falha da ação: o dinheiro JÁ saiu.
    expect(alerta).toHaveTextContent('FOI PAGA')
    expect(alerta).toHaveTextContent('40 lançamentos foram liquidados')
    expect(alerta).toHaveTextContent('R$ 1.847,90')
    // A proibição nomeia o que a duplicata criaria — não é um "cuidado" vago.
    expect(alerta).toHaveTextContent('NÃO toque em pagar de novo')
    expect(alerta).toHaveTextContent('pagaria a fatura duas vezes')

    // Avisar não basta: o botão fica inerte, senão o 2º toque paga de novo.
    expect(screen.getByTestId('revisar-pagamento')).toBeDisabled()
  })

  it('com duas faturas abertas, trocar a competencia troca o total E o N', async () => {
    const usuario = userEvent.setup()
    mockApi({
      bills: [
        { competence: '2026-07', amount_cents: 3000, line_count: 1 },
        FATURA,
      ],
    })
    montar()
    await abrir(usuario)

    // A mais antiga vem selecionada: é a que vence primeiro.
    await waitFor(() =>
      expect(screen.getByTestId('fatura-total-valor')).toHaveTextContent(
        'R$ 30,00',
      ),
    )
    expect(screen.getByTestId('fatura-linhas')).toHaveTextContent(
      '1 lançamento será liquidado',
    )

    await usuario.selectOptions(
      screen.getByTestId('fatura-competencia'),
      '2026-08',
    )
    expect(screen.getByTestId('fatura-total-valor')).toHaveTextContent(
      'R$ 1.847,90',
    )
    expect(screen.getByTestId('fatura-linhas')).toHaveTextContent(
      '40 lançamentos serão liquidados',
    )
  })

  it('com UMA fatura so, nao ha seletor de competencia — mas a competencia aparece', async () => {
    const usuario = userEvent.setup()
    mockApi()
    montar()
    await abrir(usuario)

    await waitFor(() =>
      expect(screen.getByTestId('fatura-total')).toBeInTheDocument(),
    )
    // Um `<select>` de opção única é alvo de toque que não faz nada.
    expect(screen.queryByTestId('fatura-competencia')).not.toBeInTheDocument()
    expect(screen.getByText('Fatura de ago/26')).toBeInTheDocument()
  })

  it('cartao sem fatura aberta explica o vazio e nao oferece pagamento', async () => {
    const usuario = userEvent.setup()
    mockApi({ bills: [] })
    montar()
    await abrir(usuario)

    await waitFor(() =>
      expect(
        screen.getByText(/Nenhuma fatura em aberto neste cartão/),
      ).toBeInTheDocument(),
    )
    expect(screen.getByTestId('revisar-pagamento')).toBeDisabled()
  })
})

function posts(fetchMock: ReturnType<typeof mockApi>) {
  return fetchMock.mock.calls.filter(
    ([, init]) => (init as RequestInit)?.method === 'POST',
  )
}

function chamadasA(fetchMock: ReturnType<typeof mockApi>, prefixo: string) {
  return fetchMock.mock.calls.filter(([path]) =>
    (path as string).startsWith(prefixo),
  ).length
}

/** Abre o painel, espera a lista de pagamentos e toca em desfazer `tr1`. */
async function abrirDesfazer(usuario: ReturnType<typeof userEvent.setup>) {
  await abrir(usuario)
  await usuario.click(await screen.findByTestId('desfazer-tr1'))
  return within(await screen.findByTestId('confirmar-desfazer'))
}

describe('PagarFatura — desfazer o pagamento', () => {
  it('lista os pagamentos feitos DAQUELE cartao, na ordem do servidor', async () => {
    const usuario = userEvent.setup()
    const julho: BillPaymentView = {
      ...PAGAMENTO,
      transfer_id: 'tr0',
      competence: '2026-07',
      paid_on: '2026-08-04',
      amount_cents: 3000,
      line_count: 1,
    }
    const fetchMock = mockApi({ pagamentos: [[PAGAMENTO, julho]] })
    montar()
    await abrir(usuario)

    const secao = within(await screen.findByTestId('pagamentos-feitos'))
    expect(secao.getByText('Pagamentos feitos')).toBeInTheDocument()
    const itens = secao.getAllByRole('listitem')
    // O servidor já ordena (paid_on DESC, created_at DESC); a tela não reordena.
    expect(itens.map((li) => li.dataset.testid)).toEqual([
      'pagamento-tr1',
      'pagamento-tr0',
    ])
    expect(within(itens[0]).getByText('Fatura de ago/26')).toBeInTheDocument()
    expect(within(itens[0]).getByText('R$ 1.847,90')).toBeInTheDocument()
    expect(screen.getByTestId('pagamento-tr1-detalhe')).toHaveTextContent(
      'Pago em 05/09/2026 · de "Nubank PF" · 40 lançamentos',
    )
    expect(
      fetchMock.mock.calls.some(
        ([path]) => path === '/api/bills/payments?card_account_id=card1',
      ),
    ).toBe(true)
  })

  it('cartao sem pagamento registrado nao mostra a secao', async () => {
    const usuario = userEvent.setup()
    mockApi({ pagamentos: [[]] })
    montar()
    await abrir(usuario)

    await screen.findByTestId('fatura-total')
    expect(screen.queryByTestId('pagamentos-feitos')).not.toBeInTheDocument()
  })

  it('a lista de pagamentos que nao carrega nao derruba o pagar', async () => {
    const usuario = userEvent.setup()
    mockApi({ pagamentosFalham: true })
    montar()
    await abrir(usuario)

    expect(await screen.findByTestId('pagamentos-erro')).toHaveTextContent(
      'Não consegui carregar os pagamentos feitos',
    )
    // A fatura em aberto chega por outra leitura e continua pagável.
    expect(screen.getByTestId('fatura-total-valor')).toHaveTextContent(
      'R$ 1.847,90',
    )
    expect(screen.queryByTestId('fatura-erro')).not.toBeInTheDocument()
  })

  it('o dialogo diz as DUAS metades, e cancelar nao chama a API', async () => {
    const usuario = userEvent.setup()
    const fetchMock = mockApi({ pagamentos: [[PAGAMENTO]] })
    montar()
    const dialogo = await abrirDesfazer(usuario)

    expect(
      dialogo.getByText('Desfazer o pagamento da fatura de ago/26?'),
    ).toBeInTheDocument()
    const descricao = dialogo.getByText(/Isto apaga a transferência/)
    // Metade 1: o dinheiro volta (a transferência some).
    expect(descricao).toHaveTextContent(
      'apaga a transferência de R$ 1.847,90 que saiu de "Nubank PF"',
    )
    // Metade 2: as compras voltam a dever — e NÃO somem.
    expect(descricao).toHaveTextContent('volta 40 lançamentos para "em aberto"')
    expect(descricao).toHaveTextContent('Os lançamentos não são apagados')

    await usuario.click(dialogo.getByTestId('cancelar-desfazer'))
    await waitFor(() =>
      expect(
        screen.queryByTestId('confirmar-desfazer'),
      ).not.toBeInTheDocument(),
    )
    expect(posts(fetchMock)).toHaveLength(0)
    // Cancelar fecha só o diálogo: o painel segue aberto atrás.
    expect(screen.getByTestId('painel-pagar-fatura')).toBeInTheDocument()
  })

  it('confirmar posta no transfer_id certo e recarrega fatura, pagamentos e contas', async () => {
    const usuario = userEvent.setup()
    const fetchMock = mockApi({
      pagamentos: [[PAGAMENTO], []],
      // Uma linha desmarcada à mão entre a leitura da lista e o toque: o
      // servidor reabre 39, não os 40 que a lista mostrava.
      undo: {
        status: 200,
        body: {
          ok: true,
          data: {
            transfer_id: 'tr1',
            competence: '2026-08',
            amount_cents: 184790,
            unsettled_count: 39,
          },
          notifications: [],
        },
      },
    })
    const { recarregarContas } = montar()
    const dialogo = await abrirDesfazer(usuario)

    await usuario.click(dialogo.getByTestId('confirmar-desfazer-botao'))

    await waitFor(() => expect(recarregarContas).toHaveBeenCalledTimes(1))
    const enviados = posts(fetchMock)
    expect(enviados).toHaveLength(1)
    expect(enviados[0][0]).toBe('/api/bills/payments/tr1/undo')
    // As três leituras que o desfazer muda: a fatura volta a ficar em aberto,
    // o pagamento sai da lista e os DOIS saldos (corrente e cartão) mudam.
    expect(chamadasA(fetchMock, '/api/bills?')).toBe(2)
    expect(chamadasA(fetchMock, '/api/bills/payments?')).toBe(2)

    // O N do aviso é o do SERVIDOR (`unsettled_count`), não o da lista.
    expect(await screen.findByTestId('desfazer-aviso')).toHaveTextContent(
      'Pagamento da fatura de ago/26 desfeito: 39 lançamentos voltaram para "em aberto"',
    )
    await waitFor(() =>
      expect(
        screen.queryByTestId('confirmar-desfazer'),
      ).not.toBeInTheDocument(),
    )
    // Diferente de pagar, o painel FICA aberto: a fatura reaberta está ali,
    // pronta para ser paga de novo (com outra conta ou outra data).
    expect(screen.getByTestId('painel-pagar-fatura')).toBeInTheDocument()
    expect(screen.queryByTestId('pagamentos-feitos')).not.toBeInTheDocument()
    expect(screen.getByTestId('revisar-pagamento')).not.toBeDisabled()
  })

  it('pagamento inexistente ou ja desfeito: a recusa do servidor aparece e rola ate a vista', async () => {
    const usuario = userEvent.setup()
    const scrollIntoView = vi.fn()
    const original = Element.prototype.scrollIntoView
    Element.prototype.scrollIntoView = scrollIntoView

    try {
      mockApi({
        pagamentos: [[PAGAMENTO]],
        undo: {
          status: 404,
          body: {
            ok: false,
            data: null,
            notifications: [
              {
                type: 'error',
                code: 'not_found',
                message: 'Esse pagamento não existe ou já foi desfeito.',
              },
            ],
          },
        },
      })
      const { recarregarContas } = montar()
      const dialogo = await abrirDesfazer(usuario)
      await usuario.click(dialogo.getByTestId('confirmar-desfazer-botao'))

      const alerta = await screen.findByTestId('desfazer-erro')
      expect(alerta).toHaveAttribute('role', 'alert')
      expect(alerta).toHaveTextContent(
        'Esse pagamento não existe ou já foi desfeito.',
      )
      expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' })
      await waitFor(() =>
        expect(
          screen.queryByTestId('confirmar-desfazer'),
        ).not.toBeInTheDocument(),
      )
      expect(screen.getByTestId('painel-pagar-fatura')).toBeInTheDocument()
      // Recusa não move nada: nem recarga, nem trava.
      expect(recarregarContas).not.toHaveBeenCalled()
      expect(screen.queryByTestId('desfazer-aviso')).not.toBeInTheDocument()
      expect(screen.getByTestId('desfazer-tr1')).not.toBeDisabled()
    } finally {
      Element.prototype.scrollIntoView = original
    }
  })

  it('recarga falhou depois de desfazer: diz que FOI DESFEITO e trava os botoes', async () => {
    const usuario = userEvent.setup()
    // 1ª leitura da fatura (abertura) passa; a 2ª (recarga pós-desfazer) cai.
    mockApi({ pagamentos: [[PAGAMENTO]], getFalhaApartirDe: 2 })
    montar()
    const dialogo = await abrirDesfazer(usuario)
    await usuario.click(dialogo.getByTestId('confirmar-desfazer-botao'))

    const alerta = await screen.findByTestId('desfazer-erro')
    // ⚠️ Nunca pode ler como falha: a transferência JÁ foi apagada.
    expect(alerta).toHaveTextContent('FOI DESFEITO')
    expect(alerta).toHaveTextContent('R$ 1.847,90')
    expect(alerta).toHaveTextContent('"Nubank PF"')
    expect(alerta).toHaveTextContent('atualize a página')
    // A tela mostra o estado de ANTES: desfazer de novo daria 404, e pagar
    // usaria o total velho. As duas ações ficam travadas até recarregar.
    expect(screen.getByTestId('desfazer-tr1')).toBeDisabled()
    expect(screen.getByTestId('revisar-pagamento')).toBeDisabled()
    expect(screen.queryByTestId('desfazer-aviso')).not.toBeInTheDocument()
  })

  it('o dialogo de desfazer so fecha DEPOIS da resposta, e nao escapa no meio', async () => {
    const usuario = userEvent.setup()
    let responder: () => void = () => {}
    const emVoo = new Promise<void>((r) => {
      responder = r
    })
    const base = mockApi({ pagamentos: [[PAGAMENTO], []] })
    vi.stubGlobal(
      'fetch',
      vi.fn(async (path: string, init?: RequestInit) => {
        if (path.endsWith('/undo')) await emVoo
        return base(path, init)
      }),
    )

    montar()
    const dialogo = await abrirDesfazer(usuario)
    await usuario.click(dialogo.getByTestId('confirmar-desfazer-botao'))

    // Mesmo defeito medido no pagar (CLAUDE.md, "A tela de pagar fatura"):
    // fechar dentro do gesto deixa o `click` cair no overlay do painel.
    await waitFor(() =>
      expect(screen.getByTestId('confirmar-desfazer-botao')).toBeDisabled(),
    )
    expect(screen.getByTestId('confirmar-desfazer')).toBeInTheDocument()
    expect(screen.getByTestId('confirmar-desfazer-botao')).toHaveTextContent(
      'Desfazendo…',
    )
    expect(screen.getByTestId('cancelar-desfazer')).toBeDisabled()
    await usuario.keyboard('{Escape}')
    expect(screen.getByTestId('confirmar-desfazer')).toBeInTheDocument()

    responder()

    await waitFor(() =>
      expect(
        screen.queryByTestId('confirmar-desfazer'),
      ).not.toBeInTheDocument(),
    )
    expect(await screen.findByTestId('desfazer-aviso')).toBeInTheDocument()
  })

  it('desfazer que deu certo limpa o erro antigo do pagar: nada de alerta velho ao lado do aviso', async () => {
    const usuario = userEvent.setup()
    mockApi({ pagamentos: [[PAGAMENTO], []] })
    montar()
    await abrir(usuario)
    await screen.findByTestId('fatura-total')
    await screen.findByTestId('desfazer-tr1')

    // Um erro do pagar fica na tela (pagar sem escolher a origem)...
    await usuario.click(screen.getByTestId('revisar-pagamento'))
    expect(screen.getByTestId('fatura-erro')).toHaveTextContent(
      'Escolha a conta de onde o dinheiro sai.',
    )

    // ...e o desfazer bem-sucedido o tira, como pagar tira as mensagens do
    // desfazer. Um role=alert velho ao lado do role=status de sucesso diria
    // ao leitor de tela que algo falhou agora.
    await usuario.click(screen.getByTestId('desfazer-tr1'))
    const dialogo = within(await screen.findByTestId('confirmar-desfazer'))
    await usuario.click(dialogo.getByTestId('confirmar-desfazer-botao'))

    expect(await screen.findByTestId('desfazer-aviso')).toBeInTheDocument()
    expect(screen.queryByTestId('fatura-erro')).not.toBeInTheDocument()
  })
})
