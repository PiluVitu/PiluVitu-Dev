import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TransferirPage } from './transferir'

// ⚠️ Relógio FIXO no arquivo inteiro: o campo Data nasce em
// `todayInTeresina()`, e um teste que dependesse do dia real viraria vermelho
// sozinho na virada de mês — este módulo já teve dois casos assim. O instante
// escolhido é 01:00 UTC, que é 22h do dia ANTERIOR em Teresina (UTC−3): é
// exatamente o horário em que `new Date().toISOString().slice(0,10)` erra o
// dia, então o default certo é `2026-07-31`, nunca `2026-08-01`.
//
// `toFake: ['Date']` e NÃO `useFakeTimers()` puro: congelar `setTimeout`
// quebraria `waitFor`/`userEvent`, que dependem de timers reais por baixo.
const AGORA = new Date('2026-08-01T01:00:00Z')
const HOJE_EM_TERESINA = '2026-07-31'

const contas = [
  {
    id: 'a-pj',
    name: 'Nubank PJ',
    scope: 'PJ',
    kind: 'checking',
    closing_day: null,
    due_day: null,
    balance_cents: 900000,
  },
  {
    id: 'a-pf',
    name: 'Nubank PF',
    scope: 'PF',
    kind: 'checking',
    closing_day: null,
    due_day: null,
    balance_cents: 100000,
  },
  {
    id: 'a-cartao',
    name: 'Nubank cartao',
    scope: 'PF',
    kind: 'credit_card',
    closing_day: 25,
    due_day: 5,
    balance_cents: -18000,
  },
]

// As sete semeadas pela migration `0001` + uma filha, pra cobrir os QUATRO
// `kind` que `GET /api/categories` devolve (a rota não filtra sozinha).
const categorias = [
  {
    id: 'c-prolabore',
    parent_id: null,
    name: 'Pro-labore',
    kind: 'transfer',
    slug: 'pro-labore',
    default_scope: null,
    archived_at: null,
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'c-transferencia',
    parent_id: null,
    name: 'Transferencia entre contas',
    kind: 'transfer',
    slug: 'transferencia-entre-contas',
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
    name: 'DAS',
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
    default_scope: 'PJ',
    archived_at: null,
    created_at: '2026-01-01T00:00:00Z',
  },
]

type Resposta = { status: number; corpo: unknown }

const ok = (data: unknown): Resposta => ({
  status: 200,
  corpo: { ok: true, data, notifications: [] },
})

const erro = (status: number, code: string, message: string): Resposta => ({
  status,
  corpo: {
    ok: false,
    data: null,
    notifications: [{ type: 'error', code, message }],
  },
})

/**
 * `fetch` roteado por path e método — nunca um `mockResolvedValue` único.
 * Mesma disciplina já endurecida em `App.test.tsx`/`BlocoSaldos.test.tsx`:
 * um mock que responde a mesma coisa pra qualquer rota faria o teste
 * exercitar um shape que a API nunca devolve, e uma rota nova esquecida
 * passaria batida em vez de falhar alto.
 */
function mockRoutes(
  opts: { post?: Resposta; getFalhaApartirDe?: number } = {},
) {
  let gets = 0
  const fn = vi.fn(async (path: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      if (path === '/api/transfers') {
        const r = opts.post ?? ok({ transfer_id: 't1' })
        return { status: r.status, json: async () => r.corpo }
      }
      throw new Error(`POST nao mockado: ${path}`)
    }
    if (
      path.startsWith('/api/accounts') ||
      path.startsWith('/api/categories')
    ) {
      gets += 1
      if (
        opts.getFalhaApartirDe !== undefined &&
        gets > opts.getFalhaApartirDe
      ) {
        // Rede caindo de verdade (o Android do dono), não envelope de erro:
        // é assim que um GET falha quando o sinal some depois do POST.
        throw new TypeError('Failed to fetch')
      }
      const data = path.startsWith('/api/accounts') ? contas : categorias
      const r = ok(data)
      return { status: r.status, json: async () => r.corpo }
    }
    throw new Error(`rota nao mockada: ${path}`)
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

function postsDe(fetchMock: ReturnType<typeof mockRoutes>, path: string) {
  return fetchMock.mock.calls.filter(
    ([p, init]) =>
      p === path && (init as RequestInit | undefined)?.method === 'POST',
  )
}

function corpoDoPost(
  fetchMock: ReturnType<typeof mockRoutes>,
  path: string,
): Record<string, unknown> {
  const call = postsDe(fetchMock, path)[0]
  if (!call) throw new Error(`nenhum POST ${path}`)
  return JSON.parse((call[1] as RequestInit).body as string)
}

async function montar(opts?: Parameters<typeof mockRoutes>[0]) {
  const fetchMock = mockRoutes(opts)
  render(<TransferirPage />)
  await screen.findByTestId('form-transferencia')
  await waitFor(() =>
    expect(
      (screen.getByLabelText(/^De \(/) as HTMLSelectElement).options.length,
    ).toBe(3),
  )
  return fetchMock
}

async function preencher(
  user: ReturnType<typeof userEvent.setup>,
  campos: {
    origem?: string
    destino?: string
    valor?: string
    descricao?: string
    categoria?: string
    data?: string
  },
) {
  if (campos.origem !== undefined)
    await user.selectOptions(screen.getByLabelText(/^De \(/), campos.origem)
  if (campos.destino !== undefined)
    await user.selectOptions(screen.getByLabelText(/^Para \(/), campos.destino)
  if (campos.valor !== undefined) {
    await user.clear(screen.getByLabelText('Valor'))
    // `user.type('')` lança ("Expected key descriptor") — string vazia é
    // "não digitou nada", e o `clear` acima já produziu esse estado.
    if (campos.valor !== '')
      await user.type(screen.getByLabelText('Valor'), campos.valor)
  }
  if (campos.descricao !== undefined) {
    await user.clear(screen.getByLabelText('Descrição'))
    if (campos.descricao !== '')
      await user.type(screen.getByLabelText('Descrição'), campos.descricao)
  }
  if (campos.categoria !== undefined)
    await user.selectOptions(
      screen.getByLabelText(/^Categoria/),
      campos.categoria,
    )
  if (campos.data !== undefined) {
    const input = screen.getByLabelText('Data') as HTMLInputElement
    await user.clear(input)
    if (campos.data !== '') await user.type(input, campos.data)
  }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(AGORA)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('TransferirPage — o formulário que faltava pra POST /api/transfers', () => {
  it('cria a transferência num ÚNICO POST /api/transfers, nunca dois lançamentos soltos', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const fetchMock = await montar()

    await preencher(user, {
      origem: 'a-pj',
      destino: 'a-pf',
      valor: '4.300,00',
      descricao: 'Pro-labore de agosto',
    })
    await user.click(screen.getByRole('button', { name: 'Transferir' }))

    await waitFor(() =>
      expect(postsDe(fetchMock, '/api/transfers')).toHaveLength(1),
    )
    expect(corpoDoPost(fetchMock, '/api/transfers')).toEqual({
      from_account_id: 'a-pj',
      to_account_id: 'a-pf',
      amount_cents: 430000,
      date: HOJE_EM_TERESINA,
      description: 'Pro-labore de agosto',
    })

    // ⚠️ A asserção NEGATIVA é o ponto da fatia: as duas pernas nascem de UMA
    // requisição (um `db.batch()` no servidor, mesmo `transfer_id`). Se a tela
    // caísse pro atalho de dois `POST /api/transactions`, o `#/fluxo` passaria
    // a contar uma despesa real E uma receita real — a dupla contagem que
    // `transfer_id` existe pra impedir, e que hoje acontece por ausência
    // desta tela.
    expect(postsDe(fetchMock, '/api/transactions')).toHaveLength(0)

    // As DUAS pernas nomeadas pro dono: quem saiu e quem entrou.
    const okMsg = await screen.findByTestId('transferencia-ok')
    expect(okMsg).toHaveTextContent('R$ 4.300,00')
    expect(okMsg).toHaveTextContent('saiu de Nubank PJ')
    expect(okMsg).toHaveTextContent('entrou em Nubank PF')
  })

  it('o caso REAL do pro-labore: PJ → PF com a categoria Pro-labore na perna de saída', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const fetchMock = await montar()

    await preencher(user, {
      origem: 'a-pj',
      destino: 'a-pf',
      valor: '4.300,00',
      descricao: 'Pro-labore de agosto',
      categoria: 'c-prolabore',
    })
    await user.click(screen.getByRole('button', { name: 'Transferir' }))

    await waitFor(() =>
      expect(postsDe(fetchMock, '/api/transfers')).toHaveLength(1),
    )
    // A categoria é o campo NOVO — é ele que torna "quanto tirei de
    // pro-labore este ano?" respondível. Sem ele, 'pro-labore' fica só na
    // string de descrição.
    expect(corpoDoPost(fetchMock, '/api/transfers')).toEqual({
      from_account_id: 'a-pj',
      to_account_id: 'a-pf',
      amount_cents: 430000,
      date: HOJE_EM_TERESINA,
      description: 'Pro-labore de agosto',
      category_id: 'c-prolabore',
    })
  })

  it('a mesma conta nos dois lados é recusada NO CLIENTE, sem gastar requisição', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const fetchMock = await montar()

    await preencher(user, {
      origem: 'a-pj',
      destino: 'a-pj',
      valor: '100,00',
      descricao: 'teste',
    })
    await user.click(screen.getByRole('button', { name: 'Transferir' }))

    expect(await screen.findByTestId('transferencia-erro')).toHaveTextContent(
      /contas diferentes/i,
    )
    expect(postsDe(fetchMock, '/api/transfers')).toHaveLength(0)
  })

  it.each([
    ['0,00', /maior que zero/i],
    ['-100,00', /maior que zero/i],
    ['abacaxi', /Valor inválido/i],
    ['', /Valor inválido/i],
  ])('valor %j é recusado no cliente', async (digitado, esperado) => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const fetchMock = await montar()

    await preencher(user, {
      origem: 'a-pj',
      destino: 'a-pf',
      valor: digitado,
      descricao: 'teste',
    })
    await user.click(screen.getByRole('button', { name: 'Transferir' }))

    expect(await screen.findByTestId('transferencia-erro')).toHaveTextContent(
      esperado,
    )
    expect(postsDe(fetchMock, '/api/transfers')).toHaveLength(0)
  })

  it('data vazia é recusada no cliente (o campo limpo, ou o preenchimento parcial do Android)', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const fetchMock = await montar()

    await preencher(user, {
      origem: 'a-pj',
      destino: 'a-pf',
      valor: '100,00',
      descricao: 'teste',
      data: '',
    })
    await user.click(screen.getByRole('button', { name: 'Transferir' }))

    expect(await screen.findByTestId('transferencia-erro')).toHaveTextContent(
      /Data inválida/i,
    )
    expect(postsDe(fetchMock, '/api/transfers')).toHaveLength(0)
  })

  it('o campo Data nasce em HOJE de Teresina, nunca no dia UTC', async () => {
    // 22h de 31/07 em Teresina já é 01/08 em UTC. `new Date().toISOString()`
    // daria 2026-08-01 e a transferência (que já nasce liquidada, `settled_at`
    // = esta data) cairia no mês seguinte no fluxo de caixa.
    await montar()
    expect(screen.getByLabelText('Data')).toHaveValue(HOJE_EM_TERESINA)
  })

  it('categoria é OPCIONAL: sem escolher, a chave nem aparece no corpo (nunca string vazia)', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const fetchMock = await montar()

    await preencher(user, {
      origem: 'a-pj',
      destino: 'a-pf',
      valor: '50,00',
      descricao: 'Reserva do mês',
    })
    await user.click(screen.getByRole('button', { name: 'Transferir' }))

    await waitFor(() =>
      expect(postsDe(fetchMock, '/api/transfers')).toHaveLength(1),
    )
    const corpo = corpoDoPost(fetchMock, '/api/transfers')
    // Asserção sobre a AUSÊNCIA da chave, não só `toEqual`: uma string vazia
    // bateria na FK de `categories(id)` e viraria 422 por um campo opcional.
    expect('category_id' in corpo).toBe(false)
  })

  it('o select de categoria é o OPOSTO do de Lançar: transfer aparece, debt_settlement não', async () => {
    await montar()
    const rotulos = Array.from(
      (screen.getByLabelText(/^Categoria/) as HTMLSelectElement).options,
    ).map((o) => o.textContent ?? '')

    // O que só faz sentido AQUI (em `#/lancar` estes dois nunca aparecem):
    expect(rotulos).toContain('Pro-labore')
    expect(rotulos).toContain('Transferencia entre contas')
    // Despesa e receita continuam oferecidas — a tela de categorias só cria
    // essas duas, então exigir `kind='transfer'` prenderia o dono nas duas
    // linhas semeadas e um "Aporte" novo exigiria SQL manual.
    expect(rotulos).toContain('Custos da PJ')
    expect(rotulos).toContain('Freela')
    expect(rotulos).toContain('\u00a0\u00a0↳ DAS')
    // O único excluído: quitação de dívida tem tela e mecanismo próprios.
    expect(rotulos).not.toContain('Quitacao de divida')
  })

  it('a recusa do SERVIDOR aparece na tela, com a mensagem dele, e rola até a vista', async () => {
    const scroll = vi.spyOn(Element.prototype, 'scrollIntoView')
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const fetchMock = await montar({
      post: erro(
        422,
        'invalid_transfer',
        'categoria c-prolabore esta arquivada — escolha uma categoria ativa',
      ),
    })

    await preencher(user, {
      origem: 'a-pj',
      destino: 'a-pf',
      valor: '4.300,00',
      descricao: 'Pro-labore de agosto',
      categoria: 'c-prolabore',
    })
    await user.click(screen.getByRole('button', { name: 'Transferir' }))

    const alerta = await screen.findByTestId('transferencia-erro')
    // A mensagem vem CRUA do servidor — é ela que nomeia a saída ("escolha
    // uma categoria ativa"); reescrevê-la por um texto genérico deixaria o
    // dono sem saber o que fazer.
    expect(alerta).toHaveTextContent(/arquivada/)
    expect(alerta).toHaveTextContent(/categoria ativa/)
    // ⚠️ Lição de `#/extrato`: uma recusa fora do viewport não existe pro
    // dono. `block: 'nearest'` rola o mínimo e é no-op quando já está visível.
    expect(scroll).toHaveBeenCalledWith({ block: 'nearest' })
    // Nada de sucesso, e o formulário continua de pé com o que foi digitado.
    expect(screen.queryByTestId('transferencia-ok')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Valor')).toHaveValue('4.300,00')
    expect(postsDe(fetchMock, '/api/transfers')).toHaveLength(1)
  })

  it('POST 2xx com a RECARGA falhando NÃO diz que falhou — e proíbe o reenvio nomeando o estrago', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    // 2 GETs no mount (contas + categorias); a recarga pós-POST é a 3ª/4ª.
    const fetchMock = await montar({ getFalhaApartirDe: 2 })

    await preencher(user, {
      origem: 'a-pj',
      destino: 'a-pf',
      valor: '4.300,00',
      descricao: 'Pro-labore de agosto',
    })
    await user.click(screen.getByRole('button', { name: 'Transferir' }))

    const alerta = await screen.findByTestId('transferencia-erro')
    // A mutação ACONTECEU — a mensagem tem que dizer isso primeiro.
    expect(alerta).toHaveTextContent(/FOI registrada/)
    // E proibir o reenvio NOMEANDO o que a duplicata criaria: não é "tente de
    // novo", é dinheiro contado a mais.
    expect(alerta).toHaveTextContent(/Não envie de novo/)
    expect(alerta).toHaveTextContent(/SEGUNDA transferência/)
    expect(alerta).toHaveTextContent(/duas vezes/)
    // ⚠️ A mensagem do GET que caiu NUNCA é repassada — era exatamente ela
    // que fazia o dono ler "falhou" depois de uma ação bem-sucedida.
    expect(alerta).not.toHaveTextContent(/Failed to fetch/)
    // E o POST saiu UMA vez só.
    expect(postsDe(fetchMock, '/api/transfers')).toHaveLength(1)
  })

  it('a ajuda explica POR QUE pro-labore é transferência e não despesa — no clique, nunca no hover', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    await montar()

    const gatilho = screen.getByRole('button', {
      name: 'Ajuda sobre Transferência',
    })
    // Hover não abre: em toque (o Android do dono) `hover` não existe.
    await user.hover(gatilho)
    expect(screen.queryByText(/não saiu do seu bolso/i)).not.toBeInTheDocument()

    await user.click(gatilho)
    expect(
      await screen.findByText(/pro-labore é transferência, não despesa/i),
    ).toBeInTheDocument()
    expect(screen.getByText(/não saiu do seu bolso/i)).toBeInTheDocument()
  })

  it('a aba "Transferência" está marcada como a atual, e a de Lançamento aponta pra #/lancar', async () => {
    await montar()
    const abas = screen.getByTestId('abas-lancar')
    const transferencia = screen.getByRole('link', { name: 'Transferência' })
    const lancamento = screen.getByRole('link', { name: 'Lançamento' })

    expect(abas).toContainElement(transferencia)
    expect(transferencia).toHaveAttribute('aria-current', 'true')
    expect(transferencia).toHaveAttribute('href', '#/lancar/transferir')
    // ⚠️ `aria-current` só na aba atual — a outra não pode carregá-lo, senão
    // o leitor de tela anuncia as duas como "atual".
    expect(lancamento).not.toHaveAttribute('aria-current')
    expect(lancamento).toHaveAttribute('href', '#/lancar')
  })
})
