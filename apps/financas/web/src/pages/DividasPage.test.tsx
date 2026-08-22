import { formatBRL } from '@piluvitu/tools/money'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DividasPage } from './DividasPage'

function setLarguraJanela(largura: number) {
  Object.defineProperty(window, 'innerWidth', {
    writable: true,
    configurable: true,
    value: largura,
  })
}

const dividas = [
  {
    id: 'd1',
    title: 'Pai',
    payee_name: 'PAI',
    direction: 'i_owe',
    total_cents: 730000,
    paid_cents: 594000,
    remaining_cents: 136000,
  },
]

const payees = [{ id: 'p1', name: 'Pai', kind: 'person' }]

function json(data: unknown, status = 200) {
  return new Response(
    JSON.stringify({ ok: status < 400, data, notifications: [] }),
    {
      status,
      headers: { 'content-type': 'application/json' },
    },
  )
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    if (method === 'GET' && url.startsWith('/api/debts')) return json(dividas)
    if (method === 'GET' && url.startsWith('/api/payees')) return json(payees)
    if (method === 'POST' && url === '/api/payees')
      return json({ id: 'p9', name: 'Tio', kind: 'person' }, 201)
    if (method === 'POST' && url === '/api/debts')
      return json({ id: 'd9' }, 201)
    throw new Error(`url inesperada: ${method} ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  setLarguraJanela(1024)
})

describe('DividasPage', () => {
  it('lista as dividas abertas com total, pago e restante', async () => {
    render(<DividasPage />)

    expect(await screen.findByRole('link', { name: 'Pai' })).toHaveAttribute(
      'href',
      '#/dividas/d1',
    )
    const tabela = screen.getByRole('table')
    expect(within(tabela).getByText(formatBRL(730000))).toBeInTheDocument()
    expect(within(tabela).getByText(formatBRL(594000))).toBeInTheDocument()
    expect(within(tabela).getByText(formatBRL(136000))).toBeInTheDocument()
  })

  it('sem "Aberta em" preenchida, usa o dia de Teresina (nao UTC) como default', async () => {
    // 01:00 UTC de 01/08 e 22h de 31/07 em Teresina (UTC-3). Fake so o Date
    // (nao os timers): waitFor/userEvent usam setTimeout de verdade por
    // baixo, e travariam se o relogio inteiro estivesse congelado.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-08-01T01:00:00Z'))
    try {
      const user = userEvent.setup()
      render(<DividasPage />)
      await screen.findByRole('link', { name: 'Pai' })

      await user.type(screen.getByLabelText('Título'), 'Tio')
      await user.selectOptions(screen.getByLabelText('Pessoa'), '__novo__')
      await user.type(screen.getByLabelText('Nome da pessoa'), 'Tio')
      await user.click(screen.getByRole('button', { name: 'Criar dívida' }))

      await waitFor(() => {
        const corpoDivida = fetchMock.mock.calls.find(
          (c) =>
            String(c[0]) === '/api/debts' &&
            (c[1] as RequestInit).method === 'POST',
        )
        expect(corpoDivida).toBeDefined()
        expect(
          JSON.parse(String((corpoDivida![1] as RequestInit).body)).opened_at,
        ).toBe('2026-07-31')
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it('cria payee inline e usa o id retornado no POST /api/debts', async () => {
    const user = userEvent.setup()
    render(<DividasPage />)
    await screen.findByRole('link', { name: 'Pai' })

    await user.type(screen.getByLabelText('Título'), 'Tio')
    await user.selectOptions(screen.getByLabelText('Pessoa'), '__novo__')
    await user.type(screen.getByLabelText('Nome da pessoa'), 'Tio')
    await user.click(screen.getByRole('button', { name: 'Criar dívida' }))

    await waitFor(() => {
      const posts = fetchMock.mock.calls.filter(
        (c) => (c[1] as RequestInit | undefined)?.method === 'POST',
      )
      expect(posts.map((c) => String(c[0]))).toEqual([
        '/api/payees',
        '/api/debts',
      ])
    })

    const corpoPayee = JSON.parse(
      String(
        (
          fetchMock.mock.calls.find(
            (c) =>
              String(c[0]) === '/api/payees' &&
              (c[1] as RequestInit).method === 'POST',
          )![1] as RequestInit
        ).body,
      ),
    )
    expect(corpoPayee).toEqual({ name: 'Tio', kind: 'person' })

    const corpoDivida = JSON.parse(
      String(
        (
          fetchMock.mock.calls.find(
            (c) =>
              String(c[0]) === '/api/debts' &&
              (c[1] as RequestInit).method === 'POST',
          )![1] as RequestInit
        ).body,
      ),
    )
    expect(corpoDivida.payee_id).toBe('p9')
    expect(corpoDivida.title).toBe('Tio')
    expect(corpoDivida.direction).toBe('i_owe')
  })

  // POST 201 + GET seguinte caindo. Antes os dois moravam no mesmo `try`:
  // a tela gravava o erro do GET em `erro`, o dono lia "falhou" e criava
  // de novo — dívida duplicada (e payee duplicado junto, `POST /api/payees`
  // não deduplica por `norm_name`).
  it('dívida criada mas recarga falhou: diz que criou e avisa pra NÃO reenviar', async () => {
    let getsDebts = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        const method = init?.method ?? 'GET'
        if (method === 'GET' && url.startsWith('/api/debts')) {
          getsDebts++
          // 1º GET = mount; o 2º é o `carregar()` de depois do POST.
          if (getsDebts >= 2) throw new TypeError('Failed to fetch')
          return json(dividas)
        }
        if (method === 'GET' && url.startsWith('/api/payees'))
          return json(payees)
        if (method === 'POST' && url === '/api/payees')
          return json({ id: 'p9', name: 'Tio', kind: 'person' }, 201)
        if (method === 'POST' && url === '/api/debts')
          return json({ id: 'd9' }, 201)
        throw new Error(`url inesperada: ${method} ${url}`)
      }),
    )

    const user = userEvent.setup()
    render(<DividasPage />)
    await screen.findByRole('link', { name: 'Pai' })

    await user.type(screen.getByLabelText('Título'), 'Tio')
    await user.selectOptions(screen.getByLabelText('Pessoa'), '__novo__')
    await user.type(screen.getByLabelText('Nome da pessoa'), 'Tio')
    await user.click(screen.getByRole('button', { name: 'Criar dívida' }))

    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveTextContent(/A dívida "Tio" foi criada/i)
    expect(alerta).toHaveTextContent(/não consegui recarregar a lista/i)
    expect(alerta).toHaveTextContent(/não envie de novo/i)
    expect(alerta).toHaveTextContent(/dívida duplicada/i)
    // Pessoa nova cadastrada nesta mesma submissão: a duplicata seria dupla.
    expect(alerta).toHaveTextContent(/segunda pessoa "Tio"/i)
    expect(alerta.textContent ?? '').not.toMatch(/falh/i)
    expect(alerta.textContent ?? '').not.toMatch(/Failed to fetch/)
    // A tela continua de pé com a lista anterior.
    expect(screen.getByRole('link', { name: 'Pai' })).toBeInTheDocument()
  })

  it('falha REAL do POST continua mostrando a mensagem do servidor', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        const method = init?.method ?? 'GET'
        if (method === 'GET' && url.startsWith('/api/debts'))
          return json(dividas)
        if (method === 'GET' && url.startsWith('/api/payees'))
          return json(payees)
        if (method === 'POST' && url === '/api/debts')
          return new Response(
            JSON.stringify({
              ok: false,
              data: null,
              notifications: [
                {
                  type: 'error',
                  code: 'constraint_violation',
                  message:
                    'Referência inválida: a pessoa informada não existe.',
                },
              ],
            }),
            { status: 422, headers: { 'content-type': 'application/json' } },
          )
        throw new Error(`url inesperada: ${method} ${url}`)
      }),
    )

    const user = userEvent.setup()
    render(<DividasPage />)
    await screen.findByRole('link', { name: 'Pai' })

    await user.type(screen.getByLabelText('Título'), 'Tio')
    await user.selectOptions(screen.getByLabelText('Pessoa'), 'p1')
    await user.click(screen.getByRole('button', { name: 'Criar dívida' }))

    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveTextContent(
      'Referência inválida: a pessoa informada não existe.',
    )
    // Falha de MUTAÇÃO nunca vira a mensagem de recarga.
    expect(alerta.textContent ?? '').not.toMatch(/foi criada/i)
  })
})

// Important 3 (fix final): em ~390px (Android) a tabela de 5 colunas
// cortava Pago E Falta ao mesmo tempo (ver comentário de
// `useMenorQueSm` em DividasPage.tsx). Abaixo de `sm` (640px, default do
// Tailwind), a lista vira um card por dívida com "Falta" em destaque; a
// tabela continua intocada em `sm` pra cima — cobrindo os dois lados do
// breakpoint, incluindo a borda exata.
describe('DividasPage — abaixo de sm (Android, ~390px): cards em vez de tabela (Important 3, fix final)', () => {
  it('em 390px renderiza um card por dívida, não a tabela', async () => {
    setLarguraJanela(390)
    render(<DividasPage />)

    await screen.findByRole('link', { name: 'Pai' })

    expect(screen.getByTestId('dividas-cards')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('em 390px o card mostra título, pessoa e as três somas (Total/Pago/Falta), sem cortar nada', async () => {
    setLarguraJanela(390)
    render(<DividasPage />)

    await screen.findByRole('link', { name: 'Pai' })

    expect(screen.getByText('PAI')).toBeInTheDocument()
    expect(screen.getByText('Falta')).toBeInTheDocument()
    expect(
      within(screen.getByTestId('dividas-cards')).getByText(formatBRL(136000)),
    ).toBeInTheDocument()
    expect(screen.getByText(`Total ${formatBRL(730000)}`)).toBeInTheDocument()
    expect(screen.getByText(`Pago ${formatBRL(594000)}`)).toBeInTheDocument()
  })

  it('"Falta" fica em destaque (fonte maior) — a pergunta que a tela responde primeiro', async () => {
    setLarguraJanela(390)
    render(<DividasPage />)

    await screen.findByRole('link', { name: 'Pai' })

    const falta = within(screen.getByTestId('dividas-cards')).getByText(
      formatBRL(136000),
    )
    expect(falta.className).toMatch(/text-lg/)
  })

  it('em 640px (limite exato do breakpoint sm) continua mostrando a tabela, não os cards', async () => {
    setLarguraJanela(640)
    render(<DividasPage />)

    await screen.findByRole('link', { name: 'Pai' })

    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.queryByTestId('dividas-cards')).not.toBeInTheDocument()
  })

  it('acompanha resize em runtime: reduzindo a janela pra 390px em tempo real, troca de tabela pra cards', async () => {
    render(<DividasPage />)
    await screen.findByRole('link', { name: 'Pai' })
    expect(screen.getByRole('table')).toBeInTheDocument()

    setLarguraJanela(390)
    act(() => {
      window.dispatchEvent(new Event('resize'))
    })

    expect(screen.getByTestId('dividas-cards')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  // ③ Vale nos DOIS markups — a tela troca de tabela pra cards abaixo de
  // `sm`, e só um dos dois existe por vez no DOM (jsdom não computa CSS).
  it('as colunas de dinheiro usam tabular-nums na tabela (>= sm)', async () => {
    render(<DividasPage />)
    await screen.findByRole('link', { name: 'Pai' })

    const celulas = Array.from(
      document.querySelectorAll('td.tabular-nums'),
    ).map((c) => c.textContent)
    expect(celulas).toEqual([
      formatBRL(730000),
      formatBRL(594000),
      formatBRL(136000),
    ])
  })

  it('as colunas de dinheiro usam tabular-nums nos cards (< sm)', async () => {
    setLarguraJanela(390)
    render(<DividasPage />)
    await screen.findByRole('link', { name: 'Pai' })

    const falta = within(screen.getByTestId('dividas-cards')).getByText(
      formatBRL(136000),
    )
    expect(falta).toHaveClass('tabular-nums')
  })

  describe('o link pro detalhe é alvo de 44px nos DOIS markups', () => {
    // ⚠️ MEDIDO em Chrome real a 390×844, com um título curto ("Tio", o
    // formato real de uma dívida de pessoa): o link media **23×18 px**.
    // 18 px de altura fica abaixo do mínimo de 24×24 do WCAG 2.5.8 (AA) —
    // e a largura acompanha o título, então quanto MAIS curto o nome, menor
    // o alvo.
    //
    // ⚠️ E ele é o ÚNICO caminho pro detalhe da dívida: não há botão, não
    // há linha clicável, não há rota alcançável de outro lugar. Errar o
    // toque aqui não é um incômodo — é ficar sem como abrir a dívida, na
    // tela em que o dono vai justamente registrar um pagamento.
    //
    // Os dois markups (card < sm e tabela ≥ sm) recebem o mesmo alvo: só um
    // dos dois existe no DOM por vez, e o defeito de 18 px de altura é do
    // link, não do breakpoint.
    it('no card (< sm)', async () => {
      setLarguraJanela(390)
      render(<DividasPage />)

      const link = await screen.findByRole('link', { name: 'Pai' })
      expect(link.className).toContain('min-h-11')
    })

    it('na tabela (>= sm)', async () => {
      setLarguraJanela(1024)
      render(<DividasPage />)

      const link = await screen.findByRole('link', { name: 'Pai' })
      expect(link.className).toContain('min-h-11')
    })
  })
})

describe('DividasPage — total devido (a soma que não existia)', () => {
  it('soma o `Falta` das dívidas e mostra como manchete', async () => {
    render(<DividasPage />)

    const total = await screen.findByTestId('total-devido')
    expect(within(total).getByTestId('total-devido-valor')).toHaveTextContent(
      'R$ 1.360,00',
    )
    expect(within(total).getByTestId('total-devido-valor').className).toContain(
      'text-3xl',
    )
    expect(total).toHaveTextContent('1 dívida(s) em aberto')
  })

  it('⚠️ `owed_to_me` NÃO entra na soma — é a pergunta oposta', async () => {
    // `GET /api/debts?status=open` devolve as DUAS direções. Somar junto
    // daria um número plausível e errado, e a tela se chama Dívidas.
    fetchMock.mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        const method = init?.method ?? 'GET'
        if (method === 'GET' && url.startsWith('/api/debts'))
          return json([
            ...dividas,
            {
              id: 'd2',
              title: 'Primo',
              payee_name: 'PRIMO',
              direction: 'owed_to_me',
              total_cents: 900000,
              paid_cents: 0,
              remaining_cents: 900000,
            },
          ])
        if (method === 'GET' && url.startsWith('/api/payees'))
          return json(payees)
        throw new Error(`url inesperada: ${method} ${url}`)
      },
    )

    render(<DividasPage />)

    const total = await screen.findByTestId('total-devido')
    expect(within(total).getByTestId('total-devido-valor')).toHaveTextContent(
      'R$ 1.360,00',
    )
    // 136000 + 900000 = 1036000 — o número que não pode aparecer.
    expect(document.body.textContent).not.toContain('R$ 10.360,00')
    expect(total).toHaveTextContent('o que me devem não entra nesta soma')
  })

  it('sem nenhuma dívida minha em aberto, a manchete não aparece', async () => {
    // "R$ 0" ocupando o topo é destaque pra ausência de assunto.
    fetchMock.mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        const method = init?.method ?? 'GET'
        if (method === 'GET' && url.startsWith('/api/debts')) return json([])
        if (method === 'GET' && url.startsWith('/api/payees'))
          return json(payees)
        throw new Error(`url inesperada: ${method} ${url}`)
      },
    )

    render(<DividasPage />)

    await screen.findByTestId('pagina-dividas')
    await waitFor(() =>
      expect(screen.queryByTestId('total-devido')).not.toBeInTheDocument(),
    )
  })
})
